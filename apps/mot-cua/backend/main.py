#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""API quy trình của ứng dụng mot-cua (backend riêng của Tầng 2, D-008).

APISIX chuyển /workflow/* tới đây (bỏ tiền tố /workflow) sau khi đã kiểm JWT Keycloak.
Dịch vụ này đứng giữa người dùng và Flowable REST:

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
  GET  /healthz                 kiểm sống (không cần token)

Chỉ dùng thư viện chuẩn Python: chạy trên image python gốc, không cài gói, không build.
"""

import base64
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
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

POSTGREST_URL = os.environ.get("DXOS_POSTGREST_URL", "http://postgrest:3000")
FLOWABLE_URL = os.environ.get("DXOS_FLOWABLE_URL", "http://flowable:8080/flowable-rest/service")
FLOWABLE_USER = os.environ.get("DXOS_FLOWABLE_USER", "rest-admin")
FLOWABLE_PASSWORD = os.environ["DXOS_FLOWABLE_PASSWORD"]
JWKS_URL = os.environ.get("DXOS_JWKS_URL", "http://keycloak:8080/realms/dxos/protocol/openid-connect/certs")
JWT_ISSUER = os.environ["DXOS_JWT_ISSUER"]
JWT_AUD = os.environ.get("DXOS_JWT_AUD", "dxos_api")
JWT_ROLE_CLIENT = os.environ.get("DXOS_JWT_ROLE_CLIENT", "dxos_api")
PORT = int(os.environ.get("PORT", "8000"))

# --- Cấu hình nghiệp vụ của mot-cua (phải khớp processes/*.bpmn20.xml) ---------------
# Mã thủ tục → khóa quy trình BPMN. Thủ tục chưa có quy trình thì không khởi tạo được.
QUY_TRINH_THEO_THU_TUC = {"KS01": "dang_ky_khai_sinh"}
# Biến người dùng được đặt khi hoàn thành từng bước: tên → (kiểu, bắt buộc).
# Biến khác (hoSoId, nguoiNopSub, hanXuLyLuc, quaHan, ketQua…) chỉ dịch vụ/quy trình đặt.
BIEN_THEO_BUOC = {
    "tiep_nhan": {"hopLe": (bool, True), "ghiChu": (str, False)},
    "bo_sung": {"ghiChu": (str, False)},
    "tham_dinh": {"datYeuCau": (bool, True), "ghiChu": (str, False)},
    "phe_duyet": {"pheDuyet": (bool, True), "ghiChu": (str, False)},
}
# Giờ hết hạn trong ngày hạn xử lý (giờ Việt Nam), dùng cho hẹn giờ cảnh báo quá hạn.
GIO_HET_HAN = "T17:00:00+07:00"

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


_FLOWABLE_AUTH = "Basic " + base64.b64encode(f"{FLOWABLE_USER}:{FLOWABLE_PASSWORD}".encode()).decode()


def flowable(method, path, body=None, cho_phep=()):
    status, data = goi(method, FLOWABLE_URL + path, body, {"Authorization": _FLOWABLE_AUTH})
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


def _khoi_tao(hs, sub):
    """hs: dòng ho_so (đọc qua RLS) kèm thu_tuc(ma)."""
    ma_tt = (hs.get("thu_tuc") or {}).get("ma")
    key = QUY_TRINH_THEO_THU_TUC.get(ma_tt)
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
    return {"processInstanceId": pi["id"], "quyTrinh": key, "buocDangMo": _buoc_dang_mo(pi["id"])}


_COT_HO_SO = "id,ma_ho_so,trang_thai,han_xu_ly,nguoi_nop_sub,thu_tuc:thu_tuc_id(ma)"


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
    tt = pgrst(token, "GET", f"/thu_tuc?id=eq.{tt_id}&select=ma")
    if not tt:
        raise Loi(404, "Không thấy thủ tục")
    if tt[0]["ma"] not in QUY_TRINH_THEO_THU_TUC:
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

    cho_phep = BIEN_THEO_BUOC.get(t["taskDefinitionKey"])
    if cho_phep is None:
        raise Loi(403, "Bước này không hoàn thành qua API")
    bien = body.get("bien") or {}
    if not isinstance(bien, dict):
        raise Loi(400, "bien phải là object")
    for ten, gia_tri in bien.items():
        if ten not in cho_phep or not isinstance(gia_tri, cho_phep[ten][0]):
            raise Loi(400, f"Biến không hợp lệ cho bước {t['taskDefinitionKey']}: {ten}")
    thieu = [ten for ten, (_, bat_buoc) in cho_phep.items() if bat_buoc and ten not in bien]
    if thieu:
        raise Loi(400, "Thiếu biến: " + ", ".join(thieu))

    if not t.get("assignee"):  # nhận task để lịch sử ghi đúng người xử lý
        status, _ = flowable("POST", f"/runtime/tasks/{task_id}", {"action": "claim", "assignee": sub},
                             cho_phep=(409,))
        if status == 409:
            raise Loi(409, "Task vừa được người khác nhận")
    flowable("POST", f"/runtime/tasks/{task_id}", {
        "action": "complete", "variables": [{"name": k, "value": v} for k, v in bien.items()]})
    log.info("hoàn thành %s (%s)", t["taskDefinitionKey"], task_id)
    return 200, {"id": task_id, "buoc": t["taskDefinitionKey"],
                 "buocDangMo": _buoc_dang_mo(t["processInstanceId"])}


# --- HTTP --------------------------------------------------------------------------
ROUTES = [
    ("POST", re.compile(r"/ho-so"), lambda tk, c, b, m: nop_ho_so(tk, c, b)),
    ("POST", re.compile(rf"/ho-so/({UUID})/khoi-tao"), lambda tk, c, b, m: khoi_tao(tk, c, m[1])),
    ("GET", re.compile(rf"/ho-so/({UUID})/tien-do"), lambda tk, c, b, m: tien_do(tk, m[1])),
    ("GET", re.compile(r"/tasks"), lambda tk, c, b, m: ds_task(tk, c)),
    ("POST", re.compile(rf"/tasks/({UUID})/complete"), lambda tk, c, b, m: hoan_thanh(tk, c, m[1], b)),
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
        path = urllib.parse.urlsplit(self.path).path.rstrip("/") or "/"
        try:
            if method == "GET" and path == "/healthz":
                return self._tra(200, {"ok": True})
            ham = None
            for m_route, mau, fn in ROUTES:
                m = mau.fullmatch(path)
                if m and m_route == method:
                    ham = (fn, m)
                    break
                if m:
                    raise Loi(405, "Phương thức không hỗ trợ")
            if not ham:
                raise Loi(404, "Không có endpoint này")
            token, claims = kiem_token(self.headers.get("Authorization"))
            body = {}
            if method == "POST":
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
        except Loi as e:
            self._tra(e.status, {"loi": e.thong_diep, **({"chiTiet": e.chi_tiet} if e.chi_tiet else {})})
        except Exception:  # noqa: BLE001 – không để lộ chi tiết lỗi nội bộ ra client
            log.exception("lỗi không lường trước")
            self._tra(500, {"loi": "Lỗi nội bộ"})

    def do_GET(self):
        self._xu_ly("GET")

    def do_POST(self):
        self._xu_ly("POST")

    def log_message(self, fmt, *args):  # không ghi query string (có thể chứa dữ liệu cá nhân)
        log.info("%s %s %s", self.command, urllib.parse.urlsplit(self.path).path, args[1] if len(args) > 1 else "")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    log.info("API quy trình mot-cua nghe cổng %d, Flowable %s", PORT, FLOWABLE_URL)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
