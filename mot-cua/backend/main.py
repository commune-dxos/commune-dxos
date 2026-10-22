#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""API một cửa: quy trình và tệp hồ sơ của bộ máy mot-cua (backend riêng của Tầng 2, D-008).

APISIX chuyển /workflow/* tới đây (bỏ tiền tố /workflow) và /files/* (giữ tiền tố) sau khi
đã kiểm JWT Keycloak. Với quy trình, dịch vụ này đứng giữa người dùng và Flowable REST:

- Kiểm lại JWT (RS256 theo JWKS của Keycloak, hạn, issuer, audience), không tin gateway.
- Đọc/ghi dữ liệu nghiệp vụ qua PostgREST BẰNG TOKEN CỦA NGƯỜI DÙNG, nên RLS của
  schema mot_cua quyết định ai thấy hồ sơ nào (công dân: hồ sơ của mình; cán bộ: lĩnh vực
  phụ trách; lãnh đạo: tất cả).
- Gọi Flowable bằng tài khoản kỹ thuật rest-admin. Chỉ dịch vụ này giữ mật khẩu đó; người
  dùng không bao giờ gọi thẳng Flowable, và dịch vụ không có endpoint nào chuyển tiếp API
  quản trị (deployment, management, identity) của Flowable.

Endpoint (đường dẫn sau khi bỏ /workflow):
  POST /ho-so                   công dân nộp hồ sơ và khởi tạo quy trình của thủ tục
  POST /ho-so/{id}/khoi-tao     khởi tạo quy trình cho hồ sơ đã nộp mà chưa có quy trình
  GET  /ho-so/{id}/tien-do      bước đang mở và các bước đã qua (ai thấy hồ sơ thì xem được)
  GET  /tasks                   task của người đang gọi (được giao hoặc thuộc nhóm của mình)
  POST /tasks/{id}/complete     nhận và hoàn thành task; chỉ nhận biến khai báo cho bước đó

Bộ máy không biết thủ tục nào: thủ tục → quy trình (thu_tuc.quy_trinh) và biến được phép ở
từng bước (thu_tuc.bien_theo_buoc, từ flowable:formProperty của BPMN) đều đọc từ danh mục mà
bộ nạp gói nap_thu_tuc.py ghi từ thu-tuc/<goi>/. Thêm thủ tục không sửa tệp này (docs/thu-tuc.md).
  GET  /healthz                 kiểm sống (không cần token)

API tệp (#7, phần thuần ở tep.py), đường dẫn giữ tiền tố /files:
  POST /files/ho-so/{id}/tep?ten=…[&thanh_phan_yeu_cau_id=…]
                                công dân tải một tệp (body = nội dung tệp, Content-Type đúng
                                loại): kiểm tên/loại/kích thước → quét ClamAV → kiểm magic bytes
                                → lưu Garage → ghi metadata. Tệp nhiễm: 422, không lưu, ghi nhật ký
  GET  /files/ho-so/{id}/tep    danh sách tệp của hồ sơ (theo RLS của người gọi)
  GET  /files/tep/{id}[?ttl=…]  metadata + link GET đã ký ngắn hạn (presigned, qua APISIX
                                /files/s3/*); client không bao giờ cầm khóa S3
Kiểm quyền bằng token của người dùng (RLS); metadata và nhật ký tệp ghi bằng tài khoản dịch
vụ Keycloak `mot_cua_tep` (role dich_vu_tep), nên công dân không tự khai được object_key hay
kết quả quét qua /api.

Sự kiện (#9, hop_thu.py): sau mỗi lời gọi Flowable thành công, ghi sự kiện ho_so.moi (khởi
tạo quy trình), ho_so.chuyen_buoc (hoàn thành task) và ho_so.hoan_tat | ho_so.tu_choi (quy
trình kết thúc) vào hộp thư đi trong PostgreSQL; mot-cua-worker phát lên RabbitMQ. Ghi sự kiện
lỗi thì chỉ ghi log, không làm hỏng request (quy trình đã chạy).

Bí mật (#10): mật khẩu rest-admin của Flowable, client secret `mot_cua_tep`, `mot_cua_su_kien`,
khóa S3 riêng của bộ máy đều đọc từ OpenBao lúc cần (bimat.py, AppRole `tang2`), chỉ giữ trong
bộ nhớ.

Chỉ dùng thư viện chuẩn Python: chạy trên image python gốc, không cài gói, không build.
"""

import base64
import datetime
import hashlib
import hmac
import json
import logging
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import bimat
import hop_thu
import tep

POSTGREST_URL = os.environ.get("DXOS_POSTGREST_URL", "http://postgrest:3000")
FLOWABLE_URL = os.environ.get("DXOS_FLOWABLE_URL", "http://flowable:8080/flowable-rest/service")
FLOWABLE_USER = os.environ.get("DXOS_FLOWABLE_USER", "rest-admin")
JWKS_URL = os.environ.get("DXOS_JWKS_URL", "http://keycloak:8080/realms/dxos/protocol/openid-connect/certs")
JWT_ISSUER = os.environ["DXOS_JWT_ISSUER"]
JWT_AUD = os.environ.get("DXOS_JWT_AUD", "dxos_api")
JWT_ROLE_CLIENT = os.environ.get("DXOS_JWT_ROLE_CLIENT", "dxos_api")
PORT = int(os.environ.get("PORT", "8000"))
TOKEN_URL = os.environ.get("DXOS_TOKEN_URL", "http://keycloak:8080/realms/dxos/protocol/openid-connect/token")
TANG2 = os.environ.get("DXOS_TANG2", "mot-cua")
CLAMAV_HOST = os.environ.get("DXOS_CLAMAV_HOST", "clamav")
CLAMAV_PORT = int(os.environ.get("DXOS_CLAMAV_PORT", "3310"))
GATEWAY_URL = os.environ.get("DXOS_GATEWAY_URL", "http://localhost:9080").rstrip("/")
FILE_MAX_BYTES = int(os.environ.get("DXOS_FILE_MAX_BYTES", str(10 * 1024 * 1024)))
FILE_LINK_TTL = int(os.environ.get("DXOS_FILE_LINK_TTL", "300"))

# --- Quy ước giữa bộ máy và gói thủ tục ------------------------------------------------
# Kiểu của flowable:formProperty → kiểu JSON nhận khi hoàn thành bước. Biến không khai báo
# (hoSoId, nguoiNopSub, hanXuLyLuc, quaHan, ketQua…) chỉ dịch vụ/quy trình đặt.
KIEU_BIEN = {"boolean": bool, "string": str, "long": int}
# Giờ hết hạn trong ngày hạn xử lý (giờ Việt Nam), dùng cho hẹn giờ cảnh báo quá hạn.
GIO_HET_HAN = "T17:00:00+07:00"
# Tệp hồ sơ: bucket khai báo trong s3/buckets.conf, client dịch vụ trong keycloak/realm.json.
BUCKET_HO_SO = "mot-cua-ho-so"
CLIENT_DICH_VU_TEP = "mot_cua_tep"

UUID = r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
TOI_DA_BODY = 64 * 1024

log = logging.getLogger("mot-cua-workflow")


class Loi(Exception):
    def __init__(self, status, thong_diep, chi_tiet=None):
        super().__init__(thong_diep)
        self.status, self.thong_diep, self.chi_tiet = status, thong_diep, chi_tiet


# --- Gọi HTTP nội bộ ------------------------------------------------------------------
def goi(method, url, body=None, headers=None, timeout=15):
    """→ (mã HTTP, JSON hoặc None). Lỗi kết nối → Loi 502."""
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw, status = r.read(), r.status
    except urllib.error.HTTPError as e:
        raw, status = e.read(), e.code
    except (urllib.error.URLError, TimeoutError) as e:
        log.error("không gọi được %s %s: %s", method, url.split("?")[0], e)
        raise Loi(502, "Dịch vụ lõi không phản hồi") from e
    try:
        return status, (json.loads(raw) if raw else None)
    except ValueError:
        return status, None


def pgrst(token, method, path, body=None, prefer=None):
    """PostgREST với token của người dùng (RLS áp dụng). Lỗi → Loi cùng mã HTTP."""
    h = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    if prefer:
        h["Prefer"] = prefer
    status, data = goi(method, POSTGREST_URL + path, body, h)
    if status >= 400:
        msg = (data or {}).get("message") if isinstance(data, dict) else None
        raise Loi(status, msg or "Lỗi dữ liệu", data)
    return data


_FLOWABLE_AUTH = {}


def _flowable_auth():
    """Header Basic của rest-admin; mật khẩu đọc từ OpenBao (dxos/core/flowable/rest-admin)."""
    if "h" not in _FLOWABLE_AUTH:
        try:
            mat_khau = bimat.doc("core/flowable/rest-admin")["password"]
        except (bimat.LoiBiMat, KeyError) as e:
            log.error("thiếu mật khẩu Flowable: %s", e)
            raise Loi(503, "Workflow engine chưa được cấu hình") from None
        _FLOWABLE_AUTH["h"] = "Basic " + base64.b64encode(f"{FLOWABLE_USER}:{mat_khau}".encode()).decode()
    return _FLOWABLE_AUTH["h"]


def flowable(method, path, body=None, cho_phep=()):
    status, data = goi(method, FLOWABLE_URL + path, body, {"Authorization": _flowable_auth()})
    if status == 401:
        # Mật khẩu vừa được xoay vòng trong OpenBao: lần gọi sau đọc lại.
        _FLOWABLE_AUTH.clear()
    if status >= 400 and status not in cho_phep:
        log.error("Flowable %s %s → %s", method, path.split("?")[0], status)
        raise Loi(502, "Workflow engine trả lỗi", {"flowable": status})
    return status, data


# --- JWT ---------------------------------------------------------------------------
def _b64url(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


# DigestInfo DER của SHA-256 (RFC 8017 §9.2) dùng trong chữ ký RSASSA-PKCS1-v1_5 (RS256).
_DIGESTINFO_SHA256 = bytes.fromhex("3031300d060960864801650304020105000420")


def _rs256_dung(signing_input, chu_ky, n, e):
    k = (n.bit_length() + 7) // 8
    if len(chu_ky) != k:
        return False
    em = pow(int.from_bytes(chu_ky, "big"), e, n).to_bytes(k, "big")
    t = _DIGESTINFO_SHA256 + hashlib.sha256(signing_input).digest()
    mong_doi = b"\x00\x01" + b"\xff" * (k - len(t) - 3) + b"\x00" + t
    return hmac.compare_digest(em, mong_doi)


class Jwks:
    """Khóa công khai của realm, tải lại khi gặp kid lạ (tối đa 1 lần/30 giây)."""

    def __init__(self, url):
        self.url, self.khoa, self.luc_tai, self.lock = url, {}, 0.0, threading.Lock()

    def lay(self, kid):
        with self.lock:
            if kid not in self.khoa and time.time() - self.luc_tai > 30:
                self.luc_tai = time.time()
                status, data = goi("GET", self.url, timeout=5)
                if status == 200 and data:
                    self.khoa = {
                        k["kid"]: (int.from_bytes(_b64url(k["n"]), "big"), int.from_bytes(_b64url(k["e"]), "big"))
                        for k in data.get("keys", [])
                        if k.get("kty") == "RSA" and k.get("use", "sig") == "sig" and "kid" in k
                    }
            return self.khoa.get(kid)


JWKS = Jwks(JWKS_URL)


def kiem_token(authorization):
    """→ (token, claims). Mọi lỗi → 401, không nói rõ lý do cho client."""
    if not authorization or not authorization.startswith("Bearer "):
        raise Loi(401, "Thiếu access token")
    token = authorization[7:].strip()
    try:
        h64, p64, s64 = token.split(".")
        header, claims = json.loads(_b64url(h64)), json.loads(_b64url(p64))
        khoa = JWKS.lay(header.get("kid")) if header.get("alg") == "RS256" else None
        if not khoa or not _rs256_dung(f"{h64}.{p64}".encode(), _b64url(s64), *khoa):
            raise ValueError("chữ ký")
        now = time.time()
        aud = claims.get("aud")
        aud = aud if isinstance(aud, list) else [aud]
        if claims.get("exp", 0) < now - 30 or claims.get("nbf", 0) > now + 30:
            raise ValueError("hết hạn")
        if claims.get("iss") != JWT_ISSUER or JWT_AUD not in aud or not claims.get("sub"):
            raise ValueError("iss/aud/sub")
    except (ValueError, KeyError, TypeError) as e:
        log.info("từ chối token: %s", e)
        raise Loi(401, "Access token không hợp lệ") from None
    return token, claims


def vai_tro(claims):
    roles = (claims.get("resource_access", {}).get(JWT_ROLE_CLIENT, {}) or {}).get("roles") or []
    return roles[0] if roles else None


def nhom_ung_vien(claims, token):
    """Nhóm của người dùng theo candidateGroups trong BPMN: lãnh đạo → lanh_dao,
    cán bộ → mã các lĩnh vực đang phụ trách (tra trong CSDL bằng token của chính họ)."""
    vai = vai_tro(claims)
    if vai == "lanh_dao":
        return {"lanh_dao"}
    if vai == "can_bo":
        sub = urllib.parse.quote(claims["sub"])
        rows = pgrst(token, "GET", f"/can_bo?sub=eq.{sub}&dang_lam_viec=is.true&select=linh_vuc(ma)")
        return {lv["ma"] for r in rows for lv in r.get("linh_vuc") or []}
    return set()


# --- Nghiệp vụ ---------------------------------------------------------------------
def _quy_trinh_cua(ma_ho_so):
    _, data = flowable("GET", "/history/historic-process-instances?size=50&businessKey="
                       + urllib.parse.quote(ma_ho_so))
    return data.get("data", [])


def _buoc_dang_mo(pi):
    _, data = flowable("GET", f"/runtime/tasks?processInstanceId={pi}")
    return [{"id": t["id"], "buoc": t["taskDefinitionKey"], "ten": t["name"]} for t in data.get("data", [])]


def phat_su_kien(loai, ho_so_id, du_lieu):
    """Ghi sự kiện vào hộp thư đi (mot-cua-worker phát lên RabbitMQ). Lỗi không làm hỏng request."""
    try:
        hop_thu.ghi(loai, ho_so_id, du_lieu)
    except (hop_thu.LoiHopThu, ValueError) as e:
        log.error("không ghi được sự kiện %s của hồ sơ %s: %s", loai, ho_so_id, e)


def _khoi_tao(hs, sub):
    """hs: dòng ho_so (đọc qua RLS) kèm thu_tuc(ma, quy_trinh)."""
    ma_tt = (hs.get("thu_tuc") or {}).get("ma")
    key = (hs.get("thu_tuc") or {}).get("quy_trinh")
    if not key:
        raise Loi(422, f"Thủ tục {ma_tt} chưa có quy trình")
    if hs["nguoi_nop_sub"] != sub:
        raise Loi(403, "Chỉ người nộp được khởi tạo quy trình")
    if hs["trang_thai"] != "moi":
        raise Loi(409, "Hồ sơ không còn ở trạng thái mới")
    if _quy_trinh_cua(hs["ma_ho_so"]):
        raise Loi(409, "Hồ sơ đã có quy trình")
    bien = {"hoSoId": hs["id"], "maHoSo": hs["ma_ho_so"], "nguoiNopSub": sub,
            "hanXuLyLuc": hs["han_xu_ly"] + GIO_HET_HAN}
    _, pi = flowable("POST", "/runtime/process-instances", {
        "processDefinitionKey": key, "businessKey": hs["ma_ho_so"],
        "variables": [{"name": k, "value": v} for k, v in bien.items()]})
    log.info("khởi tạo %s cho hồ sơ %s → %s", key, hs["ma_ho_so"], pi["id"])
    buoc = _buoc_dang_mo(pi["id"])
    phat_su_kien("ho_so.moi", hs["id"], {"processInstanceId": pi["id"], "quyTrinh": key,
                                         "hanXuLy": hs["han_xu_ly"], "buocDangMo": [b["buoc"] for b in buoc]})
    return {"processInstanceId": pi["id"], "quyTrinh": key, "buocDangMo": buoc}


_COT_HO_SO = "id,ma_ho_so,trang_thai,han_xu_ly,nguoi_nop_sub,thu_tuc:thu_tuc_id(ma,quy_trinh)"


def _doc_ho_so(token, ho_so_id):
    rows = pgrst(token, "GET", f"/ho_so?id=eq.{ho_so_id}&select={_COT_HO_SO}")
    if not rows:
        raise Loi(404, "Không thấy hồ sơ")  # không tồn tại hoặc RLS không cho xem
    return rows[0]


def nop_ho_so(token, claims, body):
    if vai_tro(claims) != "cong_dan":
        raise Loi(403, "Chỉ công dân nộp hồ sơ")
    tt_id = body.get("thu_tuc_id")
    if not isinstance(tt_id, str) or not re.fullmatch(UUID, tt_id):
        raise Loi(400, "thu_tuc_id phải là UUID")
    # Kiểm trước khi lưu để không để lại hồ sơ không có quy trình.
    tt = pgrst(token, "GET", f"/thu_tuc?id=eq.{tt_id}&select=ma,quy_trinh")
    if not tt:
        raise Loi(404, "Không thấy thủ tục")
    if not tt[0]["quy_trinh"]:
        raise Loi(422, f"Thủ tục {tt[0]['ma']} chưa có quy trình")
    # Chỉ chuyển các cột công dân được nhập; CSDL tự đặt người nộp, trạng thái, hạn xử lý.
    moi = {k: body[k] for k in ("thu_tuc_id", "ho_ten_nguoi_nop", "so_dien_thoai") if k in body}
    rows = pgrst(token, "POST", f"/ho_so?select={_COT_HO_SO}", moi, prefer="return=representation")
    hs = rows[0]
    try:
        kq = _khoi_tao(hs, claims["sub"])
    except Loi as e:
        # Hồ sơ đã lưu; client gọi lại POST /ho-so/{id}/khoi-tao khi lỗi tạm thời.
        e.chi_tiet = {"hoSo": hs}
        raise
    return 201, {"hoSo": hs, **kq}


def khoi_tao(token, claims, ho_so_id):
    return 201, _khoi_tao(_doc_ho_so(token, ho_so_id), claims["sub"])


def tien_do(token, ho_so_id):
    hs = _doc_ho_so(token, ho_so_id)
    ds = []
    for p in sorted(_quy_trinh_cua(hs["ma_ho_so"]), key=lambda p: p["startTime"]):
        _, lich_su = flowable("GET", f"/history/historic-activity-instances?processInstanceId={p['id']}"
                              "&activityType=userTask&sort=startTime&size=100")
        ds.append({
            "processInstanceId": p["id"], "quyTrinh": p["processDefinitionId"].split(":")[0],
            "batDau": p["startTime"], "ketThuc": p.get("endTime"), "diemKetThuc": p.get("endActivityId"),
            "buocDangMo": [] if p.get("endTime") else _buoc_dang_mo(p["id"]),
            "lichSu": [{"buoc": a["activityId"], "ten": a["activityName"], "batDau": a["startTime"],
                        "ketThuc": a.get("endTime")} for a in lich_su.get("data", [])],
        })
    return 200, {"hoSo": {k: hs[k] for k in ("id", "ma_ho_so", "trang_thai", "han_xu_ly")}, "quyTrinh": ds}


def _gon_task(t):
    bien = {v["name"]: v.get("value") for v in t.get("variables", [])}
    return {"id": t["id"], "buoc": t["taskDefinitionKey"], "ten": t["name"], "nguoiNhan": t.get("assignee"),
            "taoLuc": t["createTime"], "processInstanceId": t["processInstanceId"],
            "hoSoId": bien.get("hoSoId"), "maHoSo": bien.get("maHoSo"),
            "hanXuLyLuc": bien.get("hanXuLyLuc"), "quaHan": bien.get("quaHan") is True}


def ds_task(token, claims):
    truy_van = [{"assignee": claims["sub"]}]
    nhom = nhom_ung_vien(claims, token)
    if nhom:
        truy_van.append({"candidateGroupIn": sorted(nhom)})  # task chưa ai nhận của nhóm mình
    gop = {}
    for q in truy_van:
        _, data = flowable("POST", "/query/tasks", {**q, "includeProcessVariables": True, "size": 500})
        for t in data.get("data", []):
            gop[t["id"]] = _gon_task(t)
    return 200, sorted(gop.values(), key=lambda t: t["taoLuc"])


def _bien_cua_buoc(token, t):
    """Biến được phép ở bước của task, theo danh mục thủ tục có quy trình này (gói đã nạp).
    → {tên: {"kieu", "bat_buoc"}}, hoặc None nếu quy trình/bước không thuộc gói nào."""
    key = (t.get("processDefinitionId") or "").split(":")[0]
    rows = pgrst(token, "GET", "/thu_tuc?select=bien_theo_buoc&quy_trinh=eq." + urllib.parse.quote(key))
    buoc = (rows[0].get("bien_theo_buoc") or {}) if rows else {}
    return buoc.get(t["taskDefinitionKey"])


def _dung_kieu(gia_tri, kieu):
    if kieu not in KIEU_BIEN or (kieu != "boolean" and isinstance(gia_tri, bool)):
        return False
    return isinstance(gia_tri, KIEU_BIEN[kieu])


def hoan_thanh(token, claims, task_id, body):
    sub = claims["sub"]
    status, t = flowable("GET", f"/runtime/tasks/{task_id}", cho_phep=(404,))
    if status == 404:
        raise Loi(404, "Không thấy task")
    if t.get("assignee"):
        if t["assignee"] != sub:
            raise Loi(403, "Task đã giao cho người khác")
    else:
        _, links = flowable("GET", f"/runtime/tasks/{task_id}/identitylinks")
        nhom = {l["group"] for l in links if l.get("type") == "candidate" and l.get("group")}
        nguoi = {l["user"] for l in links if l.get("type") == "candidate" and l.get("user")}
        if sub not in nguoi and not (nhom & nhom_ung_vien(claims, token)):
            raise Loi(403, "Không thuộc nhóm được giao task này")

    cho_phep = _bien_cua_buoc(token, t)
    if cho_phep is None:
        raise Loi(403, "Bước này không hoàn thành qua API")
    bien = body.get("bien") or {}
    if not isinstance(bien, dict):
        raise Loi(400, "bien phải là object")
    for ten, gia_tri in bien.items():
        if ten not in cho_phep or not _dung_kieu(gia_tri, cho_phep[ten].get("kieu")):
            raise Loi(400, f"Biến không hợp lệ cho bước {t['taskDefinitionKey']}: {ten}")
    thieu = [ten for ten, kb in cho_phep.items() if kb.get("bat_buoc") and ten not in bien]
    if thieu:
        raise Loi(400, "Thiếu biến: " + ", ".join(thieu))

    pi = t["processInstanceId"]
    status, v = flowable("GET", f"/runtime/process-instances/{pi}/variables/hoSoId", cho_phep=(404,))
    ho_so_id = v.get("value") if status == 200 and isinstance(v, dict) else None

    if not t.get("assignee"):  # nhận task để lịch sử ghi đúng người xử lý
        status, _ = flowable("POST", f"/runtime/tasks/{task_id}", {"action": "claim", "assignee": sub},
                             cho_phep=(409,))
        if status == 409:
            raise Loi(409, "Task vừa được người khác nhận")
    flowable("POST", f"/runtime/tasks/{task_id}", {
        "action": "complete", "variables": [{"name": k, "value": v} for k, v in bien.items()]})
    log.info("hoàn thành %s (%s)", t["taskDefinitionKey"], task_id)
    buoc = _buoc_dang_mo(pi)
    if ho_so_id:
        phat_su_kien("ho_so.chuyen_buoc", ho_so_id, {
            "processInstanceId": pi, "tuBuoc": t["taskDefinitionKey"], "denBuoc": [b["buoc"] for b in buoc],
            "vaiTroXuLy": vai_tro(claims)})
        if not buoc:
            try:
                _phat_ket_thuc(pi, ho_so_id)
            except Loi as e:  # task đã hoàn thành: không trả lỗi cho người dùng
                log.error("không đọc được kết quả quy trình %s: %s", pi, e.thong_diep)
    return 200, {"id": task_id, "buoc": t["taskDefinitionKey"], "buocDangMo": buoc}


def _phat_ket_thuc(pi, ho_so_id):
    """Quy trình vừa kết thúc → ho_so.hoan_tat | ho_so.tu_choi theo biến ketQua của BPMN."""
    _, p = flowable("GET", f"/history/historic-process-instances/{pi}")
    if not p or not p.get("endTime"):
        return
    _, v = flowable("GET", f"/history/historic-variable-instances?processInstanceId={pi}&variableName=ketQua")
    ket_qua = ((v or {}).get("data") or [{}])[0].get("variable", {}).get("value")
    if ket_qua in ("hoan_tat", "tu_choi"):
        phat_su_kien(f"ho_so.{ket_qua}", ho_so_id, {"processInstanceId": pi, "ketQua": ket_qua,
                                                     "diemKetThuc": p.get("endActivityId")})


# --- Tệp hồ sơ (#7) -------------------------------------------------------------------
class TokenDichVu:
    """Access token Client Credentials của client dịch vụ. Client secret do tang2-realm ghi vào
    OpenBao (dxos/tang2/<DXOS_TANG2>/keycloak/<client>). Lưu đệm token tới gần hết hạn."""

    def __init__(self, client_id):
        self.client_id, self.token, self.het_han, self.lock = client_id, None, 0.0, threading.Lock()

    def lay(self):
        with self.lock:
            if self.token and time.time() < self.het_han - 30:
                return self.token
            try:
                bi_mat = bimat.doc(f"tang2/{TANG2}/keycloak/{self.client_id}")["secret"]
            except (bimat.LoiBiMat, KeyError) as e:
                log.error("thiếu secret của client %s: %s", self.client_id, e)
                raise Loi(503, "API tệp chưa được cấu hình") from None
            form = urllib.parse.urlencode({"grant_type": "client_credentials", "client_id": self.client_id,
                                           "client_secret": bi_mat}).encode()
            req = urllib.request.Request(TOKEN_URL, data=form, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=10) as r:
                    data = json.loads(r.read())
            except (urllib.error.URLError, TimeoutError, ValueError) as e:
                log.error("không lấy được token dịch vụ %s: %s", self.client_id, e)
                raise Loi(502, "Không lấy được token dịch vụ") from None
            self.token, self.het_han = data["access_token"], time.time() + int(data.get("expires_in", 60))
            return self.token


DICH_VU_TEP = TokenDichVu(CLIENT_DICH_VU_TEP)
_S3 = {}


def s3():
    """Thông tin kết nối + khóa S3 riêng của bộ máy một cửa (garage-init ghi vào OpenBao,
    dxos/tang2/<DXOS_TANG2>/s3)."""
    if not _S3:
        try:
            _S3.update(bimat.doc(f"tang2/{TANG2}/s3"))
        except bimat.LoiBiMat as e:
            log.error("thiếu cấu hình S3: %s", e)
            raise Loi(503, "Kho tệp chưa được cấu hình") from None
    return _S3


def _url_object(key):
    return f"{s3()['endpoint']}/{BUCKET_HO_SO}/{urllib.parse.quote(key)}"


def s3_goi(method, key, du_lieu=b"", tieu_de=None):
    c = s3()
    url = _url_object(key)
    sha = hashlib.sha256(du_lieu).hexdigest()
    h = tep.ky_header(method, url, c["region"], c["accessKeyId"], c["secretAccessKey"], sha, tieu_de)
    req = urllib.request.Request(url, data=du_lieu if method == "PUT" else None, method=method,
                                 headers={**(tieu_de or {}), **h})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status
    except urllib.error.HTTPError as e:
        log.error("Garage %s %s → %s", method, key, e.code)
        raise Loi(502, "Kho tệp trả lỗi") from None
    except (urllib.error.URLError, TimeoutError) as e:
        log.error("không gọi được Garage: %s", e)
        raise Loi(502, "Kho tệp không phản hồi") from None


def nhat_ky_tep(hanh_dong, claims, **cot):
    """Ghi một dòng nhật ký tệp (bảng chỉ thêm). Lỗi ghi không che kết quả cho người dùng."""
    dong = {"hanh_dong": hanh_dong, "nguoi_sub": claims["sub"], "vai_tro": vai_tro(claims) or "", **cot}
    try:
        pgrst(DICH_VU_TEP.lay(), "POST", "/nhat_ky_tep", dong, prefer="return=minimal")
    except Loi as e:
        log.error("không ghi được nhật ký tệp (%s): %s", hanh_dong, e.thong_diep)


_COT_TEP = ("id,ho_so_id,thanh_phan_yeu_cau_id,ten_tep,loai_mime,kich_thuoc,sha256,object_key,"
            "nguoi_tai_sub,ket_qua_quet,quet_luc,trang_thai_kiem_tra,created_at")


def _so(gia_tri, ten):
    try:
        return int(gia_tri)
    except (TypeError, ValueError):
        raise Loi(400, f"{ten} phải là số nguyên") from None


def tai_len(token, claims, req, ho_so_id):
    sub, vai = claims["sub"], vai_tro(claims)
    ten, duoi = tep.kiem_ten_tep(req.query.get("ten"))
    mime = tep.kiem_loai_khai_bao(duoi, req.headers.get("Content-Type"))
    yc_id = req.query.get("thanh_phan_yeu_cau_id")
    if yc_id is not None and not re.fullmatch(UUID, yc_id):
        raise Loi(400, "thanh_phan_yeu_cau_id phải là UUID")
    if req.headers.get("Content-Length") is None:
        raise Loi(411, "Thiếu Content-Length")
    n = _so(req.headers["Content-Length"], "Content-Length")
    if n > FILE_MAX_BYTES:
        raise Loi(413, f"Tệp vượt {FILE_MAX_BYTES // (1024 * 1024)} MB")
    if n <= 0:
        raise Loi(400, "Tệp rỗng")
    rows = pgrst(token, "GET", f"/ho_so?id=eq.{ho_so_id}&select=id,trang_thai,nguoi_nop_sub")
    tep.kiem_quyen_tai_len(vai, sub, rows[0] if rows else None)

    du_lieu = req.rfile.read(n)
    if len(du_lieu) != n:
        raise Loi(400, "Nhận thiếu dữ liệu tệp")
    sha = hashlib.sha256(du_lieu).hexdigest()
    vet = {"ho_so_id": ho_so_id, "ten_tep": ten, "kich_thuoc": n, "sha256": sha}
    # Quét MỌI tệp nhận được trước khi làm gì khác với nội dung: tệp nhiễm luôn bị ghi nhật
    # ký, kể cả khi sai loại. clamd không trả lời → 503, không lưu.
    sach, ma_doc = tep.quet_clamav(CLAMAV_HOST, CLAMAV_PORT, du_lieu)
    if not sach:
        log.warning("chặn tệp nhiễm %s (sha256 %s) của %s vào hồ sơ %s", ma_doc, sha, sub, ho_so_id)
        nhat_ky_tep("tu_choi_ma_doc", claims, **vet, chi_tiet=ma_doc)
        raise Loi(422, "Tệp chứa mã độc, đã từ chối và không lưu", {"maDoc": ma_doc})
    try:
        tep.kiem_magic(duoi, du_lieu)
    except tep.LoiTep as e:
        nhat_ky_tep("tu_choi_loai_tep", claims, **vet, chi_tiet=f"đuôi .{duoi}, nhận diện {tep.nhan_dien(du_lieu)}")
        raise e

    key = f"ho-so/{ho_so_id}/{uuid.uuid4()}.{'jpg' if duoi == 'jpeg' else duoi}"
    s3_goi("PUT", key, du_lieu, {"Content-Type": mime})
    dong = {**vet, "thanh_phan_yeu_cau_id": yc_id, "loai_mime": mime, "object_key": key,
            "nguoi_tai_sub": sub, "ket_qua_quet": "sach", "may_quet": _phien_ban_clamav(),
            "quet_luc": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    try:
        moi = pgrst(DICH_VU_TEP.lay(), "POST", f"/thanh_phan_ho_so?select={_COT_TEP}", dong,
                    prefer="return=representation")[0]
    except Loi:
        try:
            s3_goi("DELETE", key)  # không để lại object không có metadata
        except Loi:
            log.error("không xóa được object mồ côi %s", key)
        raise
    nhat_ky_tep("tai_len", claims, **vet, thanh_phan_ho_so_id=moi["id"])
    log.info("lưu tệp %s (%d byte) vào hồ sơ %s", moi["id"], n, ho_so_id)
    return 201, moi


def _phien_ban_clamav():
    try:
        return tep.phien_ban_clamav(CLAMAV_HOST, CLAMAV_PORT)[:200]
    except tep.LoiTep:
        return None


def _ton_tai(bang, tep_id):
    return bool(pgrst(DICH_VU_TEP.lay(), "GET", f"/{bang}?id=eq.{tep_id}&select=id"))


def ds_tep(token, claims, ho_so_id):
    thay = bool(pgrst(token, "GET", f"/ho_so?id=eq.{ho_so_id}&select=id"))
    tep.kiem_quyen_xem(vai_tro(claims), thay, thay or _ton_tai("ho_so", ho_so_id))
    return 200, pgrst(token, "GET", f"/thanh_phan_ho_so?ho_so_id=eq.{ho_so_id}&select={_COT_TEP}&order=created_at")


def xem_tep(token, claims, req, tep_id):
    rows = pgrst(token, "GET", f"/thanh_phan_ho_so?id=eq.{tep_id}&select={_COT_TEP}")
    tep.kiem_quyen_xem(vai_tro(claims), bool(rows), bool(rows) or _ton_tai("thanh_phan_ho_so", tep_id))
    r = rows[0]
    if not r.get("object_key"):
        raise Loi(404, "Giấy tờ này chưa có tệp lưu trữ")
    ttl = _so(req.query.get("ttl", FILE_LINK_TTL), "ttl")
    if not 1 <= ttl <= FILE_LINK_TTL:
        raise Loi(400, f"ttl phải trong 1–{FILE_LINK_TTL} giây")
    c = s3()
    url = tep.presign("GET", _url_object(r["object_key"]), c["region"], c["accessKeyId"], c["secretAccessKey"],
                      ttl, query_them={"response-content-type": r["loai_mime"],
                                       "response-content-disposition": tep.content_disposition(r["ten_tep"])})
    nhat_ky_tep("cap_link", claims, ho_so_id=r["ho_so_id"], thanh_phan_ho_so_id=r["id"], ten_tep=r["ten_tep"],
                kich_thuoc=r["kich_thuoc"], sha256=r["sha256"], chi_tiet=f"ttl {ttl}s")
    het_han = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=ttl)
    # Garage (S3) không mở ra ngoài: link đi qua APISIX /files/s3/*, chữ ký do Garage kiểm.
    return 200, {**r, "link": GATEWAY_URL + "/files/s3" + url[len(c["endpoint"]):],
                 "hetHanLuc": het_han.isoformat(timespec="seconds")}


# --- HTTP --------------------------------------------------------------------------
# (phương thức, đường dẫn, body JSON?, hàm(token, claims, body JSON hoặc request, match))
ROUTES = [
    ("POST", re.compile(r"/ho-so"), True, lambda tk, c, b, m: nop_ho_so(tk, c, b)),
    ("POST", re.compile(rf"/ho-so/({UUID})/khoi-tao"), True, lambda tk, c, b, m: khoi_tao(tk, c, m[1])),
    ("GET", re.compile(rf"/ho-so/({UUID})/tien-do"), True, lambda tk, c, b, m: tien_do(tk, m[1])),
    ("GET", re.compile(r"/tasks"), True, lambda tk, c, b, m: ds_task(tk, c)),
    ("POST", re.compile(rf"/tasks/({UUID})/complete"), True, lambda tk, c, b, m: hoan_thanh(tk, c, m[1], b)),
    # Tệp: body là nội dung tệp, hàm tự đọc từ request.
    ("POST", re.compile(rf"/files/ho-so/({UUID})/tep"), False, lambda tk, c, r, m: tai_len(tk, c, r, m[1])),
    ("GET", re.compile(rf"/files/ho-so/({UUID})/tep"), False, lambda tk, c, r, m: ds_tep(tk, c, m[1])),
    ("GET", re.compile(rf"/files/tep/({UUID})"), False, lambda tk, c, r, m: xem_tep(tk, c, r, m[1])),
]


class Handler(BaseHTTPRequestHandler):
    server_version = "dxos-mot-cua-workflow"
    sys_version = ""

    def _tra(self, status, data):
        raw = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _xu_ly(self, method):
        u = urllib.parse.urlsplit(self.path)
        path = u.path.rstrip("/") or "/"
        self.query = dict(urllib.parse.parse_qsl(u.query, keep_blank_values=True))
        try:
            if method == "GET" and path == "/healthz":
                return self._tra(200, {"ok": True})
            ham, khop_duong = None, False
            for m_route, mau, json_body, fn in ROUTES:
                m = mau.fullmatch(path)
                khop_duong = khop_duong or bool(m)
                if m and m_route == method:
                    ham = (fn, m, json_body)
                    break
            if not ham:
                raise Loi(405, "Phương thức không hỗ trợ") if khop_duong else Loi(404, "Không có endpoint này")
            token, claims = kiem_token(self.headers.get("Authorization"))
            body = {} if ham[2] else self
            if method == "POST" and ham[2]:
                n = int(self.headers.get("Content-Length") or 0)
                if n > TOI_DA_BODY:
                    raise Loi(413, "Body quá lớn")
                try:
                    body = json.loads(self.rfile.read(n) or b"{}")
                except ValueError:
                    raise Loi(400, "Body không phải JSON") from None
                if not isinstance(body, dict):
                    raise Loi(400, "Body phải là object JSON")
            status, data = ham[0](token, claims, body, ham[1])
            self._tra(status, data)
        except (Loi, tep.LoiTep) as e:
            self._tra(e.status, {"loi": e.thong_diep, **({"chiTiet": e.chi_tiet} if e.chi_tiet else {})})
        except Exception:  # noqa: BLE001 – không để lộ chi tiết lỗi nội bộ ra client
            log.exception("lỗi không lường trước")
            self._tra(500, {"loi": "Lỗi nội bộ"})

    def do_GET(self):
        self._xu_ly("GET")

    def do_POST(self):
        self._xu_ly("POST")

    def log_message(self, fmt, *args):  # không ghi query string (tên tệp, chữ ký…)
        log.info("%s %s %s", self.command, urllib.parse.urlsplit(self.path).path, args[1] if len(args) > 1 else "")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    log.info("API quy trình mot-cua nghe cổng %d, Flowable %s", PORT, FLOWABLE_URL)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
