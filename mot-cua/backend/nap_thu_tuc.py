#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Bộ nạp gói thủ tục (D-009): dịch vụ một lần `nap-thu-tuc` (make nap-thu-tuc).

  python nap_thu_tuc.py <thư mục thu-tuc>              nạp mọi gói (chạy trong Docker)
  python nap_thu_tuc.py <thư mục thu-tuc> --chi-kiem   chỉ kiểm gói, không gọi mạng (make check)

Với mỗi thư mục con thu-tuc/<goi>/:
  1. Kiểm gói (goi_thu_tuc.kiem_goi): đủ tệp, YAML, JSON Schema, BPMN, dữ liệu mẫu khớp schema.
  2. Deploy quy-trinh.bpmn20.xml lên Flowable qua REST (tài khoản rest-admin), tên deployment
     `thu-tuc/<goi>@<12 ký tự đầu SHA-256 của BPMN>`: đã có deployment cùng tên thì bỏ qua,
     nên chạy lại không sinh phiên bản quy trình mới khi BPMN không đổi.
  3. Ghi danh mục qua PostgREST: RPC mot_cua.nap_thu_tuc bằng token Client Credentials của
     client mot_cua_danh_muc (role dich_vu_danh_muc, chỉ gọi được RPC nạp/rút gói).
Gói lỗi ở bước nào thì in lý do, bỏ qua gói đó (bản nạp tốt trước đó, nếu có, được giữ), các gói
khác vẫn nạp. Cuối cùng rút các gói không còn thư mục (RPC mot_cua.rut_goi_vang).
Mã thoát: 0 kể cả khi có gói lỗi (không làm sập hệ thống); 1 khi Flowable, Keycloak hay
PostgREST không gọi được, hoặc (--chi-kiem) khi có gói lỗi.

Bí mật (OpenBao, AppRole `tang2`, chỉ trong bộ nhớ): mật khẩu rest-admin của Flowable, client
secret mot_cua_danh_muc. Chỉ thư viện chuẩn Python.
"""

import base64
import json
import logging
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

import goi_thu_tuc

POSTGREST_URL = os.environ.get("DXOS_POSTGREST_URL", "http://postgrest:3000")
FLOWABLE_URL = os.environ.get("DXOS_FLOWABLE_URL", "http://flowable:8080/flowable-rest/service")
FLOWABLE_USER = os.environ.get("DXOS_FLOWABLE_USER", "rest-admin")
TOKEN_URL = os.environ.get("DXOS_TOKEN_URL", "http://keycloak:8080/realms/dxos/protocol/openid-connect/token")
TANG2 = os.environ.get("DXOS_TANG2", "mot-cua")
CLIENT_DANH_MUC = "mot_cua_danh_muc"
CHO_TOI_DA_GIAY = int(os.environ.get("DXOS_NAP_CHO_GIAY", "120"))

log = logging.getLogger("nap-thu-tuc")


class LoiHaTang(Exception):
    """Flowable, Keycloak, PostgREST hay OpenBao không gọi được: dừng cả lần nạp (mã 1)."""


class LoiGoi(Exception):
    """Gói bị dịch vụ từ chối (BPMN Flowable không nhận, ràng buộc CSDL…): bỏ qua gói này."""


def goi_http(method, url, data=None, headers=None, timeout=30):
    """→ (mã HTTP, body bytes). Lỗi kết nối → LoiHaTang."""
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
        raise LoiHaTang(f"không gọi được {url.split('?')[0]}: {e}") from None


def _json(raw):
    try:
        return json.loads(raw) if raw else None
    except ValueError:
        return None


def _chi_tiet(raw):
    """Thông điệp lỗi ngắn từ body JSON của Flowable/PostgREST (không in cả body)."""
    d = _json(raw)
    if isinstance(d, dict):
        return d.get("message") or d.get("exception") or d.get("details") or str(d)[:200]
    return (raw or b"")[:200].decode("utf-8", "replace")


class KetNoi:
    """Thông tin đăng nhập Flowable và PostgREST của bộ nạp (đọc OpenBao khi tạo)."""

    def __init__(self):
        import bimat  # chỉ cần khi nạp thật; --chi-kiem chạy được trên máy không có OpenBao
        try:
            mk = bimat.doc("core/flowable/rest-admin")["password"]
            bi_mat = bimat.doc(f"tang2/{TANG2}/keycloak/{CLIENT_DANH_MUC}")["secret"]
        except (bimat.LoiBiMat, KeyError) as e:
            raise LoiHaTang(f"không đọc được bí mật từ OpenBao: {e}") from None
        self.flowable_auth = "Basic " + base64.b64encode(f"{FLOWABLE_USER}:{mk}".encode()).decode()
        form = urllib.parse.urlencode({"grant_type": "client_credentials", "client_id": CLIENT_DANH_MUC,
                                       "client_secret": bi_mat}).encode()
        status, raw = goi_http("POST", TOKEN_URL, form, {"Content-Type": "application/x-www-form-urlencoded"})
        if status != 200:
            raise LoiHaTang(f"Keycloak không cấp token cho {CLIENT_DANH_MUC} (HTTP {status})")
        self.token = _json(raw)["access_token"]

    def flowable(self, method, path, data=None, headers=None):
        h = {"Authorization": self.flowable_auth, "Accept": "application/json", **(headers or {})}
        status, raw = goi_http(method, FLOWABLE_URL + path, data, h)
        if status >= 500 or status in (401, 403):
            raise LoiHaTang(f"Flowable {method} {path.split('?')[0]} → HTTP {status}: {_chi_tiet(raw)}")
        return status, raw

    def rpc(self, ham, tham_so):
        status, raw = goi_http("POST", f"{POSTGREST_URL}/rpc/{ham}", json.dumps(tham_so).encode(), {
            "Authorization": f"Bearer {self.token}", "Content-Type": "application/json",
            "Accept": "application/json", "Content-Profile": "mot_cua"})
        if status >= 500 or status in (401, 403, 404):
            raise LoiHaTang(f"PostgREST rpc/{ham} → HTTP {status}: {_chi_tiet(raw)}")
        if status >= 400:
            raise LoiGoi(f"CSDL từ chối ({_chi_tiet(raw)})")
        return _json(raw)


def cho_san_sang():
    """Chờ Flowable và PostgREST trả lời (vừa `up` xong có thể chưa nhận kết nối)."""
    het_han = time.time() + CHO_TOI_DA_GIAY
    for url in (FLOWABLE_URL.rsplit("/service", 1)[0] + "/actuator/health", POSTGREST_URL + "/"):
        while True:
            try:
                goi_http("GET", url, timeout=5)
                break
            except LoiHaTang:
                if time.time() > het_han:
                    raise
                time.sleep(3)


def _multipart(ten_tep, noi_dung):
    ranh_gioi = uuid.uuid4().hex
    body = (f"--{ranh_gioi}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{ten_tep}\"\r\n"
            "Content-Type: text/xml\r\n\r\n").encode() + noi_dung + f"\r\n--{ranh_gioi}--\r\n".encode()
    return body, {"Content-Type": f"multipart/form-data; boundary={ranh_gioi}"}


def deploy(kn, goi):
    """Deploy BPMN của gói nếu chưa có deployment cùng nội dung. → "moi" | "khong_doi"."""
    ten = f"thu-tuc/{goi['goi']}@{goi['bpmn_sha256'][:12]}"
    _, raw = kn.flowable("GET", "/repository/deployments?" + urllib.parse.urlencode({"name": ten}))
    if (_json(raw) or {}).get("total", 0) > 0:
        return "khong_doi"
    body, h = _multipart(f"{goi['goi']}.bpmn20.xml", goi["bpmn"].encode())
    status, raw = kn.flowable("POST", "/repository/deployments?" + urllib.parse.urlencode(
        {"deploymentName": ten, "deploymentKey": f"thu-tuc-{goi['goi']}"}), body, h)
    if status != 201:
        raise LoiGoi(f"Flowable không nhận BPMN (HTTP {status}: {_chi_tiet(raw)})")
    dep_id = _json(raw)["id"]
    _, raw = kn.flowable("GET", "/repository/process-definitions?" + urllib.parse.urlencode(
        {"deploymentId": dep_id, "key": goi["quy_trinh"]}))
    if (_json(raw) or {}).get("total", 0) != 1:
        raise LoiGoi(f"deployment {dep_id} không có quy trình '{goi['quy_trinh']}'")
    return "moi"


def nap(thu_muc_goc, chi_kiem=False):
    """→ mã thoát. In một dòng cho mỗi gói và một dòng tổng kết."""
    cac_goi = goi_thu_tuc.quet(thu_muc_goc)
    if not cac_goi:
        log.error("không thấy gói nào trong %s", thu_muc_goc)
        return 1 if chi_kiem else 0
    hop_le, so_loi = [], 0
    for ten, duong in cac_goi:
        goi, loi = goi_thu_tuc.kiem_goi(duong)
        if loi:
            so_loi += 1
            log.error("gói %s LỖI, bỏ qua:\n  - %s", ten, "\n  - ".join(loi))
        else:
            hop_le.append(goi)
            log.info("gói %s hợp lệ: %s %s (%s, %d ngày làm việc, %d bước)", ten, goi["ma"], goi["ten"],
                     goi["quy_trinh"], goi["so_ngay_xu_ly"], len(goi["bien_theo_buoc"]))
    if chi_kiem:
        log.info("kiểm %d gói: %d hợp lệ, %d lỗi", len(cac_goi), len(hop_le), so_loi)
        return 1 if so_loi else 0

    try:
        cho_san_sang()
        kn = KetNoi()
        da_nap = []
        for goi in hop_le:
            try:
                trang_thai = deploy(kn, goi)
                du_lieu = {k: v for k, v in goi.items() if k not in ("bpmn", "bpmn_sha256")}
                kq = kn.rpc("nap_thu_tuc", {"p_goi": du_lieu})
            except LoiGoi as e:
                so_loi += 1
                log.error("gói %s LỖI, bỏ qua: %s", goi["goi"], e)
                continue
            da_nap.append(goi["goi"])
            log.info("gói %s → BPMN %s, danh mục %s %s (%d thành phần)", goi["goi"],
                     "deploy mới" if trang_thai == "moi" else "không đổi",
                     "thêm" if kq.get("moi") else "cập nhật", goi["ma"], kq.get("soThanhPhan", 0))
        rut = kn.rpc("rut_goi_vang", {"p_con_lai": [t for t, _ in cac_goi]})
    except LoiHaTang as e:
        log.error("dừng: %s", e)
        return 1
    log.info("xong: %d gói đã nạp (%s), %d gói lỗi bị bỏ qua, rút %d thủ tục không còn gói%s",
             len(da_nap), ", ".join(da_nap) or "–", so_loi, len(rut or []),
             f" ({', '.join(rut)})" if rut else "")
    return 0


def main(argv):
    logging.basicConfig(level=logging.INFO, format="nap-thu-tuc: %(message)s", stream=sys.stdout)
    if not argv or argv[0].startswith("-"):
        print(__doc__.split("\n\n")[1])
        return 2
    return nap(argv[0], chi_kiem="--chi-kiem" in argv[1:])


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
