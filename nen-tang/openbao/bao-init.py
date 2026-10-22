#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Dịch vụ một lần `bao-init` của lõi (make bao-init): đưa OpenBao về trạng thái dùng được.

Chạy lại bao nhiêu lần cũng được (idempotent), chạy tự động ở mỗi `make up`:
  1. Chưa khởi tạo → `sys/init` (Shamir BAO_KEY_SHARES/BAO_KEY_THRESHOLD), ghi unseal key +
     root token vào BAO_INIT_FILE (thư mục .data/openbao/ trên máy, ngoài git, quyền 600).
  2. Đang seal → unseal bằng khóa trong tệp đó (BAO_UNSEAL=file, CHỈ DÙNG CHO MÁY DEV).
     BAO_UNSEAL=manual: không đọc unseal key từ tệp; seal thì dừng và hướng dẫn unseal tay.
  3. KV v2 ở `dxos/`, auth AppRole, policy dxos-<danh tính> từ nen-tang/openbao/policies/*.hcl
     (thay ${DXOS_TANG2} bằng tên dịch vụ Tầng 2).
  4. Bí mật lõi chưa có thì tạo: lấy từ biến .env cũ nếu còn (chuyển từ .env sang OpenBao),
     không thì sinh ngẫu nhiên. Không bao giờ ghi đè giá trị đã có, trừ BAO_IMPORT_ENV=force.
  5. Mỗi danh tính một AppRole (token 15 phút, chỉ policy của mình); role_id + secret_id ghi
     vào volume bí mật riêng của danh tính đó (/vol/<danh tính>/approle/, quyền 0400, chủ là
     uid của dịch vụ dùng nó). secret_id còn hiệu lực thì giữ.
  6. Xóa bí mật dạng rõ của bản trước #10 còn sót trong volume (s3.json, keycloak-*.secret).

Không in bí mật, unseal key hay token ra log. Chỉ dùng thư viện chuẩn Python.
"""

import glob
import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.request

ADDR = os.environ.get("BAO_ADDR", "http://openbao:8200").rstrip("/")
INIT_FILE = os.environ.get("BAO_INIT_FILE", "/bao-init/commune.json")
UNSEAL = os.environ.get("BAO_UNSEAL", "file")
KEY_SHARES = int(os.environ.get("BAO_KEY_SHARES", "1"))
KEY_THRESHOLD = int(os.environ.get("BAO_KEY_THRESHOLD", "1"))
IMPORT_ENV = os.environ.get("BAO_IMPORT_ENV", "auto")
TANG2 = os.environ["DXOS_TANG2"]
POLICY_DIR = os.environ.get("BAO_POLICY_DIR", "/nen-tang/openbao/policies")
VOL = os.environ.get("BAO_IDENTITY_VOLUMES", "/vol")
MOUNT = "dxos"

# Danh tính → uid của dịch vụ dùng volume bí mật đó (agent render bằng đúng uid này).
DANH_TINH = {
    "db": 70,           # postgres:*-alpine; db-init, tang2-migrate chạy root
    "postgrest": 1000,
    "keycloak": 1000,
    "tang2-realm": 0,     # tang2-realm chạy root trong image Keycloak
    "flowable": 100,
    "garage": 0,
    "garage-init": 0,
    "tang2": 0,         # mot-cua-api, mot-cua-worker, nap-thu-tuc (dịch vụ Tầng 2 DXOS_TANG2)
    "rabbitmq": 100,    # rabbitmq:*-alpine (#9)
    "rabbitmq-init": 0,
}
# Thời hạn token theo danh tính: agent một lần chỉ cần vài giây; backend chạy lâu thì
# đăng nhập lại khi token hết hạn.
TOKEN_TTL = {"tang2": ("1h", "4h")}


def _hex32():
    return secrets.token_hex(32)


def _mat_khau():
    # 32 ký tự [A-Za-z0-9_-]: an toàn khi nằm trong URI kết nối PostgreSQL.
    return secrets.token_urlsafe(24)


# Bí mật lõi: đường dẫn KV → {khóa: (biến .env cũ, hàm sinh)}.
BI_MAT_LOI = {
    "core/db/postgres": {"password": ("POSTGRES_PASSWORD", _mat_khau)},
    "core/db/authenticator": {"password": ("PGRST_DB_PASSWORD", _mat_khau)},
    "core/db/keycloak": {"password": ("KEYCLOAK_DB_PASSWORD", _mat_khau)},
    "core/db/flowable": {"password": ("FLOWABLE_DB_PASSWORD", _mat_khau)},
    "core/keycloak/admin": {"password": ("KEYCLOAK_ADMIN_PASSWORD", _mat_khau)},
    "core/flowable/rest-admin": {"password": ("FLOWABLE_ADMIN_PASSWORD", _mat_khau)},
    "core/garage": {"rpc_secret": (None, _hex32), "admin_token": (None, _hex32)},
    "core/rabbitmq/admin": {"password": (None, _mat_khau)},
}


def log(msg):
    print(f"bao-init: {msg}", flush=True)


def dung(msg):
    sys.exit(f"bao-init: {msg}")


def goi(method, path, body=None, token=None, cho_phep=()):
    """HTTP API của OpenBao → (mã, JSON). Mã ≥ 400 ngoài cho_phep → dừng (không in body)."""
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(f"{ADDR}/v1/{path}", data=data, method=method)
    if token:
        req.add_header("X-Vault-Token", token)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            status, raw = r.status, r.read()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read()
    if status >= 400 and status not in cho_phep:
        dung(f"{method} {path} → HTTP {status}")
    try:
        return status, (json.loads(raw) if raw else None)
    except ValueError:
        return status, None


def cho_openbao():
    for _ in range(60):
        try:
            # sys/seal-status trả 200 cả khi chưa khởi tạo hay đang seal.
            _, st = goi("GET", "sys/seal-status")
            return st
        except (urllib.error.URLError, OSError):
            time.sleep(2)
    dung(f"OpenBao không phản hồi ở {ADDR} sau 2 phút")


def ghi_tep(duong, noi_dung, uid=0, mode=0o400):
    """Ghi nguyên tử, quyền chặt ngay từ lúc tạo (không có lúc nào ai cũng đọc được)."""
    tam = duong + ".tmp"
    if os.path.exists(tam):
        os.remove(tam)
    fd = os.open(tam, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(noi_dung)
    os.chown(tam, uid, uid)
    os.chmod(tam, mode)
    os.replace(tam, duong)


def khoi_tao(st):
    if st["initialized"]:
        return
    if os.path.exists(INIT_FILE):
        # Tệp của một OpenBao khác (volume đã bị xóa): giữ lại, không ghi đè.
        cu = f"{INIT_FILE}.{time.strftime('%Y%m%d-%H%M%S')}.bak"
        os.replace(INIT_FILE, cu)
        log(f"OpenBao chưa khởi tạo nhưng đã có {INIT_FILE}: đổi tên thành {cu}")
    _, kq = goi("PUT", "sys/init", {"secret_shares": KEY_SHARES, "secret_threshold": KEY_THRESHOLD})
    os.makedirs(os.path.dirname(INIT_FILE), mode=0o700, exist_ok=True)
    os.chmod(os.path.dirname(INIT_FILE), 0o700)
    ghi_tep(INIT_FILE, json.dumps({
        "unseal_keys_b64": kq["keys_base64"],
        "unseal_threshold": KEY_THRESHOLD,
        "root_token": kq["root_token"],
        "ghi_chu": "Unseal key + root token OpenBao của Commune DX-OS. KHÔNG xóa, KHÔNG commit. "
                   "Mất tệp này (khi OpenBao đang seal) = mất mọi bí mật trong két.",
    }, indent=2) + "\n", mode=0o600)
    log(f"đã khởi tạo OpenBao ({KEY_SHARES} phần khóa, ngưỡng {KEY_THRESHOLD}); "
        f"unseal key + root token ở {INIT_FILE} (quyền 600, ngoài git)")


def doc_init():
    try:
        with open(INIT_FILE, encoding="utf-8") as f:
            return json.load(f)
    except OSError:
        dung(f"thiếu {INIT_FILE}: OpenBao đã khởi tạo nhưng không có unseal key/root token trên máy này")


def unseal(st):
    if not st["sealed"]:
        return
    if UNSEAL != "file":
        dung("OpenBao đang seal. Unseal tay: docker compose exec openbao bao operator unseal "
             "(lặp lại đủ ngưỡng), rồi chạy lại make bao-init")
    for khoa in doc_init()["unseal_keys_b64"]:
        _, kq = goi("PUT", "sys/unseal", {"key": khoa})
        if not kq["sealed"]:
            break
    else:
        dung("unseal không thành công với khóa trong tệp")
    log("đã unseal (BAO_UNSEAL=file: tự unseal bằng tệp khóa, chỉ dùng cho máy dev)")


def cho_active():
    """Sau unseal, raft cần vài giây để nút thành active; trước đó API trả 500/503."""
    for _ in range(60):
        status, _ = goi("GET", "sys/health", cho_phep=(429, 472, 473, 500, 501, 503))
        if status == 200:
            return
        time.sleep(1)
    dung("OpenBao đã unseal nhưng không thành nút active sau 60 giây")


def cau_hinh(tk):
    _, mounts = goi("GET", "sys/mounts", token=tk)
    if f"{MOUNT}/" not in mounts["data"]:
        goi("POST", f"sys/mounts/{MOUNT}", {"type": "kv", "options": {"version": "2"},
                                             "description": "Bí mật Commune DX-OS"}, tk)
        log(f"đã bật KV v2 ở {MOUNT}/")
    # Giữ 5 phiên bản gần nhất của mỗi bí mật (khôi phục khi đổi nhầm).
    goi("POST", f"{MOUNT}/config", {"max_versions": 5}, tk)
    _, auths = goi("GET", "sys/auth", token=tk)
    if "approle/" not in auths["data"]:
        goi("POST", "sys/auth/approle", {"type": "approle"}, tk)
        log("đã bật auth AppRole")
    for tep in sorted(glob.glob(os.path.join(POLICY_DIR, "*.hcl"))):
        ten = os.path.basename(tep)[:-4]
        with open(tep, encoding="utf-8") as f:
            noi_dung = f.read().replace("${DXOS_TANG2}", TANG2)
        goi("PUT", f"sys/policies/acl/dxos-{ten}", {"policy": noi_dung}, tk)
    log(f"policy dxos-* cập nhật cho Tầng 2 {TANG2}")


def bi_mat_cu_garage():
    """rpc_secret/admin_token do garage-secrets bản trước #10 sinh, nếu volume còn."""
    cu = {}
    for k in ("rpc_secret", "admin_token"):
        try:
            with open(os.path.join(VOL, "garage", k), encoding="utf-8") as f:
                cu[k] = f.read().strip()
        except OSError:
            pass
    return cu


def nap_bi_mat(tk):
    garage_cu = bi_mat_cu_garage()
    da_nhap = []
    for duong, khoa in BI_MAT_LOI.items():
        status, kq = goi("GET", f"{MOUNT}/data/{duong}", token=tk, cho_phep=(404,))
        hien = kq["data"]["data"] if status == 200 else {}
        moi, nguon = dict(hien), {}
        for k, (bien_env, sinh) in khoa.items():
            cu = os.environ.get(f"LEGACY_{bien_env}", "") if bien_env else garage_cu.get(k, "")
            if k in hien and not (IMPORT_ENV == "force" and cu):
                continue
            if cu:
                moi[k], nguon[k] = cu, bien_env or "volume garage-secrets cũ"
                if bien_env:
                    da_nhap.append(bien_env)
            else:
                moi[k], nguon[k] = sinh(), "sinh ngẫu nhiên"
        if moi != hien:
            goi("POST", f"{MOUNT}/data/{duong}", {"data": moi}, tk)
            log(f"{MOUNT}/{duong}: " + ", ".join(f"{k} ← {v}" for k, v in nguon.items()))
    if da_nhap:
        log("ĐÃ CHUYỂN từ .env sang OpenBao: " + ", ".join(da_nhap)
            + ". Xóa các dòng này khỏi .env (xem docs/architecture.md §4.4.5).")


def cap_approle(tk):
    for ten, uid in DANH_TINH.items():
        ttl, max_ttl = TOKEN_TTL.get(ten, ("15m", "1h"))
        goi("POST", f"auth/approle/role/{ten}", {
            "token_policies": [f"dxos-{ten}"], "token_ttl": ttl, "token_max_ttl": max_ttl,
            "secret_id_ttl": 0, "token_type": "service"}, tk)
        _, kq = goi("GET", f"auth/approle/role/{ten}/role-id", token=tk)
        role_id = kq["data"]["role_id"]
        goc = os.path.join(VOL, ten)
        thu_muc = os.path.join(goc, "approle")
        os.makedirs(thu_muc, exist_ok=True)
        for d in (goc, thu_muc):
            os.chown(d, uid, uid)
            os.chmod(d, 0o700)
        tep_sid = os.path.join(thu_muc, "secret_id")
        sid = None
        if os.path.exists(tep_sid):
            with open(tep_sid, encoding="utf-8") as f:
                sid = f.read().strip()
            status, _ = goi("POST", f"auth/approle/role/{ten}/secret-id/lookup", {"secret_id": sid},
                            tk, cho_phep=(204, 400, 404))
            if status != 200:
                sid = None
        moi = sid is None
        if moi:
            _, kq = goi("POST", f"auth/approle/role/{ten}/secret-id", {}, tk)
            sid = kq["data"]["secret_id"]
            ghi_tep(tep_sid, sid, uid)
        ghi_tep(os.path.join(thu_muc, "role_id"), role_id, uid)
        log(f"AppRole {ten}: policy dxos-{ten}, secret_id {'mới' if moi else 'giữ nguyên'} → volume {ten}-secrets")


def don_bi_mat_cu():
    for tep in [os.path.join(VOL, "tang2", "s3.json"), *glob.glob(os.path.join(VOL, "tang2", "keycloak-*.secret"))]:
        if os.path.exists(tep):
            os.remove(tep)
            log(f"đã xóa bí mật dạng rõ của bản trước #10: volume tang2-secrets/{os.path.basename(tep)}")


def main():
    st = cho_openbao()
    khoi_tao(st)
    unseal(goi("GET", "sys/seal-status")[1])
    cho_active()
    tk = os.environ.get("BAO_TOKEN") or doc_init()["root_token"]
    cau_hinh(tk)
    nap_bi_mat(tk)
    cap_approle(tk)
    don_bi_mat_cu()
    log("OpenBao sẵn sàng")


if __name__ == "__main__":
    main()
