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
  POST /ho-so                   công dân nộp hồ sơ và khởi tạo quy trình ngay (chỉ thủ tục không
                                có thành phần bắt buộc; còn lại → 422 trước khi lưu)
  POST /ho-so/{id}/khoi-tao     khởi tạo quy trình cho hồ sơ đã nộp mà chưa có quy trình
  GET  /ho-so/{id}/tien-do      bước đang mở và các bước đã qua (ai thấy hồ sơ thì xem được)
  GET  /tasks                   task của người đang gọi (được giao hoặc thuộc nhóm của mình)
  POST /tasks/{id}/complete     nhận và hoàn thành task; chỉ nhận biến khai báo cho bước đó
  GET  /thong-bao/luong         Server-Sent Events cho chuông cổng cán bộ (#56): số thông báo chưa đọc
                                đổi thì đẩy `thong-bao` (thong_bao.py); cán bộ, lãnh đạo

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

Giấy tờ có ký số (#77, phần thuần ở ky_so.py): biên nhận phát hành ngay sau khi khởi tạo quy
trình, thông báo kết quả ngay khi hồ sơ hoàn tất (luồng nền, lỗi chỉ ghi log), hoặc khi người có
quyền xem hồ sơ yêu cầu. Mẫu mot-cua/mau-giay-to/ → Gotenberg → pyHanko ký PAdES bằng chứng thư
step-ca (ca-init ghi vào OpenBao dxos/tang2/<DXOS_TANG2>/ky-so) → Garage → giay_to_ky (dich_vu_tep;
trigger ghi kiểm toán giay_to.ky kèm SHA-256):
  GET  /files/ho-so/{id}/giay-to            giấy tờ đã phát hành của hồ sơ (theo RLS)
  POST /files/ho-so/{id}/giay-to/{loai}     loai = bien_nhan | ket_qua: phát hành nếu chưa có
                                            (201) hoặc trả bản đã có (200), kèm link tải ngắn hạn
  GET  /files/giay-to/{id}                  metadata + link tải ngắn hạn
  POST /files/xac-minh                      body = PDF bất kỳ (application/pdf): kiểm chữ ký số
                                            theo CA của xã, đối chiếu SHA-256 với giấy tờ đã phát hành
                                            và văn bản đi đã ký

Đọc giấy tờ bằng OCR, cán bộ xác nhận (#93, phần thuần ở doc_giay_to.py; dịch vụ OCR của nền tảng ở profile ai):
  GET  /files/doc-giay-to/loai              loại giấy tờ đọc được và các trường (mot-cua/doc-giay-to/loai-giay-to.json)
  POST /files/doc-giay-to?loai=…            đọc thử một ảnh (body = PNG/JPEG) để tự điền form: ClamAV → magic bytes
                                            → OCR → trích trường. Không lưu gì
  POST /files/tep/{id}/khai                 công dân gửi các trường đã xem/sửa cho tệp của hồ sơ mình (JSON {truong})
  POST /files/tep/{id}/doc                  cán bộ cho máy đọc lại tệp đã lưu
  POST /files/tep/{id}/xac-nhan             cán bộ chốt giá trị sau khi so ảnh gốc (JSON {truong}); sau đó không sửa được
  Tải ảnh giấy tờ có mẫu đọc lên (POST /files/ho-so/{id}/tep) → máy đọc tệp đã lưu ở luồng nền. Đọc kết quả:
  /api/doc_giay_to (RLS theo hồ sơ). Mọi ghi bằng tài khoản dịch vụ tệp, CSDL ghi kiểm toán giay_to.khai|doc|xac_nhan.

Wiki văn bản nội bộ cho cán bộ (#95, phần thuần ở wiki.py): CSDL quyết định ai thấy gì (RLS theo phạm vi toàn xã /
lĩnh vực phụ trách / lãnh đạo), Meilisearch CE (index mot-cua-wiki-van-ban) để tìm; ghi bằng token của người gọi:
  GET  /files/wiki/tim?q=…[&loai=…][&tat_ca=1][&so_luong=…][&tu=…]
                                            cán bộ, lãnh đạo, văn thư tìm văn bản: lọc theo quyền ở Meilisearch rồi
                                            đối chiếu RLS; Meilisearch không chạy → tìm trong CSDL (nguon = "csdl")
  POST /files/wiki                          văn thư, lãnh đạo thêm văn bản (JSON), cập nhật chỉ mục
  POST /files/wiki/{id}                     sửa (chỉ trường gửi lên; trang_thai = het_hieu_luc để ngừng hiệu lực)
  Xem chi tiết và lịch sử: /api/wiki_van_ban, /api/wiki_van_ban_lich_su (RLS). CSDL ghi kiểm toán wiki.*.

Sổ văn bản đến/đi của xã (#78), cùng lớp tệp (ClamAV, Garage) và lớp ký số; ghi bằng tài khoản dịch vụ
tệp sau khi kiểm vai người gọi, đọc sổ qua /api (RLS: cán bộ, lãnh đạo, văn thư):
  POST /files/van-ban/den?ten=…&loai=…&ky_hieu=…&ngay_van_ban=…&trich_yeu=…&noi_gui=…[&nguoi_ky=…]
                                            văn thư vào sổ văn bản đến (body = tệp quét PDF/JPG/PNG):
                                            quét ClamAV → magic bytes → Garage; PDF thì xác minh chữ ký số;
                                            CSDL cấp số đến
  POST /files/van-ban/di                    văn thư soạn dự thảo văn bản đi (JSON: loai, trich_yeu,
                                            noi_nhan, noi_dung)
  POST /files/van-ban/{id}/ky               lãnh đạo ký ban hành: CSDL cấp số đi → PDF từ mẫu
                                            van_ban_di.html → ký PAdES → Garage → đã ký (không sửa được)
  GET  /files/van-ban/{id}                  metadata + link tải ngắn hạn

Sự kiện (#9, hop_thu.py) và trạng thái hồ sơ (#73, trang_thai.py): sau mỗi lời gọi Flowable
thành công, đọc bước đang mở, tra ánh xạ bước → trạng thái của gói (thu_tuc.trang_thai_buoc) rồi
gọi RPC dong_bo_trang_thai MỘT lần: đổi ho_so.trang_thai, ghi lịch sử chuyển trạng thái và ghi sự
kiện ho_so.moi (khởi tạo), ho_so.chuyen_buoc (hoàn thành task), ho_so.hoan_tat | ho_so.tu_choi
(quy trình kết thúc) vào hộp thư đi trong cùng một transaction; mot-cua-worker phát lên RabbitMQ.
Thứ tự luôn là Flowable trước, CSDL sau: Flowable lỗi → không ghi gì vào CSDL, trả lỗi; CSDL lỗi
sau khi Flowable đã chạy → chỉ ghi log, không làm hỏng request, mot-cua-worker đối soát với
Flowable và sửa trạng thái ở vòng quét sau (worker.doi_soat_mot_lan). Gọi lại an toàn: sự kiện có
khóa chống trùng theo task/quy trình.

Bí mật (#10): mật khẩu rest-admin của Flowable, client secret `mot_cua_tep`, `mot_cua_su_kien`,
khóa S3 riêng của bộ máy đều đọc từ OpenBao lúc cần (bimat.py, AppRole `tang2`), chỉ giữ trong
bộ nhớ.

Poka-yoke phía máy chủ (#59, poka_yoke.py): trước khi gọi Flowable, dựng tài liệu hồ sơ từ các
tệp đã quét sạch trong CSDL và kiểm bằng JSON Schema 2020-12 của thủ tục; thiếu → 422 kèm lỗi
từng thành phần, không khởi tạo quy trình, không ghi sự kiện. Luồng nộp: tạo hồ sơ (/api/ho_so)
→ tải tệp (/files) → khởi tạo (/workflow/ho-so/{id}/khoi-tao).

Thư viện ngoài: jsonschema (MIT) và pyHanko (MIT, chỉ nạp trong ky_so.py) cùng gói kéo theo
(requirements.txt, image build từ Dockerfile cạnh tệp này); phần còn lại chỉ dùng thư viện chuẩn.
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
import doc_giay_to
import hop_thu
import ky_so
import poka_yoke
import su_kien
import tep
import thong_bao
import trang_thai
import tri_thuc
import wiki

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
GOTENBERG_URL = os.environ.get("DXOS_GOTENBERG_URL", "http://gotenberg:3000")
# Dịch vụ OCR của nền tảng (#93, profile ai). Không chạy profile ai thì không gọi được: chức năng đọc giấy tờ trả
# 503, nộp và xử lý hồ sơ vẫn bình thường.
OCR_URL = os.environ.get("DXOS_OCR_URL", "http://ocr:8000").rstrip("/")
OCR_TIMEOUT = int(os.environ.get("DXOS_OCR_TIMEOUT", "120"))
# Wiki văn bản (#95): chu kỳ dựng lại chỉ mục Meilisearch từ CSDL (giây).
WIKI_DONG_BO_GIAY = int(os.environ.get("DXOS_WIKI_DONG_BO_GIAY", "300"))

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


def dong_bo_trang_thai(ho_so_id, bang, buoc_dang_mo, cac_su_kien, ket_qua=None, da_ket_thuc=False,
                       buoc=None, ten_buoc=None, ghi_chu=None, nguoi_sub=None):
    """Sau khi Flowable đã chạy: trạng thái mới theo ánh xạ của gói (trang_thai.tinh) + lịch sử +
    sự kiện trong một transaction (RPC dong_bo_trang_thai). cac_su_kien: [(loại, dữ liệu, khóa
    chống trùng)]. → trạng thái hồ sơ sau khi đồng bộ, hoặc None nếu không ghi được: lỗi không làm
    hỏng request (Flowable đã ghi nhận), mot-cua-worker đối soát lại."""
    try:
        hs = hop_thu.ngu_canh([ho_so_id]).get(ho_so_id)
        if not hs:
            raise hop_thu.LoiHopThu(f"không thấy hồ sơ {ho_so_id}")
        moi = trang_thai.tinh(hs["trang_thai"], buoc_dang_mo, bang, ket_qua, da_ket_thuc)
        ds = [(su_kien.tao(loai, hs, du_lieu), khoa) for loai, du_lieu, khoa in cac_su_kien]
        kq = hop_thu.dong_bo(ho_so_id, moi, ds, ly_do=trang_thai.ly_do(moi, ghi_chu, ten_buoc),
                             buoc=buoc, nguoi_sub=nguoi_sub)
    except (hop_thu.LoiHopThu, ValueError) as e:
        log.error("không đồng bộ được trạng thái/sự kiện của hồ sơ %s (worker sẽ đối soát): %s", ho_so_id, e)
        return None
    if kq.get("daDoi"):
        log.info("hồ sơ %s: %s → %s", hs["ma_ho_so"], kq.get("trangThaiTruoc"), kq.get("trangThai"))
    return kq.get("trangThai")


def _schema_cua(token, tt):
    """JSON Schema thành phần hồ sơ của thủ tục: thu_tuc.json_schema (gói), không có thì sinh từ
    thanh_phan_yeu_cau (RPC json_schema_thu_tuc)."""
    if isinstance(tt.get("json_schema"), dict):
        return tt["json_schema"]
    schema = pgrst(token, "GET", "/rpc/json_schema_thu_tuc?ma=" + urllib.parse.quote(tt["ma"]))
    if not isinstance(schema, dict):
        raise Loi(404, "Không thấy thủ tục")
    return schema


def kiem_thanh_phan(schema, doc, chua_sach=()):
    """Poka-yoke: thiếu/sai thành phần → Loi 422 kèm danh sách lỗi theo thành phần."""
    try:
        loi = poka_yoke.kiem(schema, doc, chua_sach)
    except poka_yoke.LoiSchema as e:
        log.error("JSON Schema của thủ tục hỏng: %s", e)
        raise Loi(500, "JSON Schema của thủ tục không hợp lệ") from None
    if loi:
        thieu = [l["ten"] for l in loi if l["thanhPhan"]]
        raise Loi(422, "Hồ sơ chưa đủ thành phần" + (": " + "; ".join(thieu) if thieu else ""),
                  {"thanhPhan": loi})


_COT_TEP_KIEM = "id,ket_qua_quet,object_key,thanh_phan_yeu_cau:thanh_phan_yeu_cau_id(ma)"


def _kiem_ho_so(token, hs):
    """Dựng tài liệu hồ sơ từ tệp đã lưu (đọc bằng token người gọi, RLS) và kiểm theo schema."""
    ds = pgrst(token, "GET", f"/thanh_phan_ho_so?ho_so_id=eq.{hs['id']}&select={_COT_TEP_KIEM}&order=created_at")
    doc, chua_sach = poka_yoke.tai_lieu(hs, ds)
    kiem_thanh_phan(_schema_cua(token, hs["thu_tuc"]), doc, chua_sach)


def _khoi_tao(hs, sub, token):
    """hs: dòng ho_so (đọc qua RLS) kèm thu_tuc(ma, quy_trinh, json_schema)."""
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
    _kiem_ho_so(token, hs)
    bien = {"hoSoId": hs["id"], "maHoSo": hs["ma_ho_so"], "nguoiNopSub": sub,
            "hanXuLyLuc": hs["han_xu_ly"] + GIO_HET_HAN}
    _, pi = flowable("POST", "/runtime/process-instances", {
        "processDefinitionKey": key, "businessKey": hs["ma_ho_so"],
        "variables": [{"name": k, "value": v} for k, v in bien.items()]})
    log.info("khởi tạo %s cho hồ sơ %s → %s", key, hs["ma_ho_so"], pi["id"])
    buoc = _buoc_dang_mo(pi["id"])
    ma_buoc = [b["buoc"] for b in buoc]
    tt = dong_bo_trang_thai(hs["id"], hs["thu_tuc"].get("trang_thai_buoc"), ma_buoc, [(
        "ho_so.moi", {"processInstanceId": pi["id"], "quyTrinh": key, "hanXuLy": hs["han_xu_ly"],
                      "buocDangMo": ma_buoc}, f"ho_so.moi:{pi['id']}")], nguoi_sub=sub)
    phat_hanh_nen(hs["id"], "bien_nhan", sub)
    return {"processInstanceId": pi["id"], "quyTrinh": key, "buocDangMo": buoc, "trangThai": tt}


_COT_HO_SO = ("id,ma_ho_so,trang_thai,han_xu_ly,nguoi_nop_sub,ho_ten_nguoi_nop,so_dien_thoai,"
              "thu_tuc:thu_tuc_id(ma,quy_trinh,json_schema,trang_thai_buoc)")


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
    tt = pgrst(token, "GET", f"/thu_tuc?id=eq.{tt_id}&select=ma,quy_trinh,json_schema")
    if not tt:
        raise Loi(404, "Không thấy thủ tục")
    if not tt[0]["quy_trinh"]:
        raise Loi(422, f"Thủ tục {tt[0]['ma']} chưa có quy trình")
    # Hồ sơ mới chưa có tệp: thủ tục có thành phần bắt buộc thì không khởi tạo ngay được. Báo
    # trước khi lưu; client tạo hồ sơ, tải tệp rồi gọi /ho-so/{id}/khoi-tao (#59).
    kiem_thanh_phan(_schema_cua(token, tt[0]), {"thanh_phan": {}})
    # Chỉ chuyển các cột công dân được nhập; CSDL tự đặt người nộp, trạng thái, hạn xử lý.
    moi = {k: body[k] for k in ("thu_tuc_id", "ho_ten_nguoi_nop", "so_dien_thoai") if k in body}
    rows = pgrst(token, "POST", f"/ho_so?select={_COT_HO_SO}", moi, prefer="return=representation")
    hs = rows[0]
    try:
        kq = _khoi_tao(hs, claims["sub"], token)
    except Loi as e:
        # Hồ sơ đã lưu; client gọi lại POST /ho-so/{id}/khoi-tao khi lỗi tạm thời.
        e.chi_tiet = {**(e.chi_tiet or {}), "hoSo": hs}
        raise
    return 201, {"hoSo": hs, **kq}


def khoi_tao(token, claims, ho_so_id):
    return 201, _khoi_tao(_doc_ho_so(token, ho_so_id), claims["sub"], token)


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


def _danh_muc_buoc(token, t):
    """Theo danh mục thủ tục có quy trình của task (gói đã nạp) → (biến được phép ở bước của task
    {tên: {"kieu", "bat_buoc"}} hoặc None nếu quy trình/bước không thuộc gói nào, ánh xạ bước →
    trạng thái hồ sơ của thủ tục)."""
    key = (t.get("processDefinitionId") or "").split(":")[0]
    rows = pgrst(token, "GET", "/thu_tuc?select=bien_theo_buoc,trang_thai_buoc&quy_trinh=eq."
                 + urllib.parse.quote(key))
    tt = rows[0] if rows else {}
    return (tt.get("bien_theo_buoc") or {}).get(t["taskDefinitionKey"]), tt.get("trang_thai_buoc")


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

    cho_phep, bang = _danh_muc_buoc(token, t)
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
    if ho_so_id and vai_tro(claims) == "cong_dan":
        # Công dân nộp lại sau khi bổ sung: hồ sơ phải đủ thành phần như lúc nộp (Poka-yoke, #59).
        _kiem_ho_so(token, _doc_ho_so(token, ho_so_id))

    if not t.get("assignee"):  # nhận task để lịch sử ghi đúng người xử lý
        status, _ = flowable("POST", f"/runtime/tasks/{task_id}", {"action": "claim", "assignee": sub},
                             cho_phep=(409,))
        if status == 409:
            raise Loi(409, "Task vừa được người khác nhận")
    flowable("POST", f"/runtime/tasks/{task_id}", {
        "action": "complete", "variables": [{"name": k, "value": v} for k, v in bien.items()]})
    log.info("hoàn thành %s (%s)", t["taskDefinitionKey"], task_id)
    buoc = _buoc_dang_mo(pi)
    tt = None
    if ho_so_id:
        ma_buoc = [b["buoc"] for b in buoc]
        ds = [("ho_so.chuyen_buoc", {"processInstanceId": pi, "tuBuoc": t["taskDefinitionKey"], "denBuoc": ma_buoc,
                                     "vaiTroXuLy": vai_tro(claims)}, f"ho_so.chuyen_buoc:{task_id}")]
        da_ket_thuc, ket_qua, diem = False, None, None
        if not buoc:
            try:
                da_ket_thuc, ket_qua, diem = _ket_thuc(pi)
            except Loi as e:  # task đã hoàn thành: không trả lỗi cho người dùng, worker đối soát
                log.error("không đọc được kết quả quy trình %s: %s", pi, e.thong_diep)
            if ket_qua in trang_thai.KET_THUC:
                ds.append((f"ho_so.{ket_qua}", {"processInstanceId": pi, "ketQua": ket_qua, "diemKetThuc": diem},
                           f"ho_so.ket_thuc:{pi}"))
        tt = dong_bo_trang_thai(ho_so_id, bang, ma_buoc, ds, ket_qua, da_ket_thuc, buoc=t["taskDefinitionKey"],
                                ten_buoc=t.get("name"), ghi_chu=bien.get("ghiChu"), nguoi_sub=sub)
        if tt == "hoan_tat":
            phat_hanh_nen(ho_so_id, "ket_qua", sub)
    return 200, {"id": task_id, "buoc": t["taskDefinitionKey"], "buocDangMo": buoc, "trangThai": tt}


def _ket_thuc(pi):
    """→ (quy trình đã kết thúc?, biến ketQua của BPMN, endActivityId)."""
    _, p = flowable("GET", f"/history/historic-process-instances/{pi}")
    if not p or not p.get("endTime"):
        return False, None, None
    _, v = flowable("GET", f"/history/historic-variable-instances?processInstanceId={pi}&variableName=ketQua")
    ket_qua = ((v or {}).get("data") or [{}])[0].get("variable", {}).get("value")
    return True, ket_qua, p.get("endActivityId")


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


def s3_doc(key):
    """Nội dung object của bộ máy trên Garage (đọc lại tệp đã lưu để OCR, #93)."""
    c = s3()
    url = _url_object(key)
    sha_rong = hashlib.sha256(b"").hexdigest()
    req = urllib.request.Request(url, method="GET",
                                 headers=tep.ky_header("GET", url, c["region"], c["accessKeyId"], c["secretAccessKey"], sha_rong))
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        log.error("Garage GET %s → %s", key, e.code)
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
    if yc_id and duoi != "pdf":
        doc_nen(moi["id"], du_lieu)  # ảnh giấy tờ có mẫu đọc (#93): máy đọc ở luồng nền
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


# --- Giấy tờ có ký số (#77) ---------------------------------------------------------------
_KY_SO = {"gia_tri": None, "luc": 0.0}
_KHOA_PHAT_HANH = threading.Lock()
_COT_GIAY_TO = "id,ho_so_id,loai,sha256,kich_thuoc,chung_thu_ten,chung_thu_so_hieu,ky_luc"
_COT_HS_GIAY_TO = ("id,ma_ho_so,trang_thai,ho_ten_nguoi_nop,ngay_nhan,han_xu_ly,ngay_hoan_tat,"
                   "thu_tuc:thu_tuc_id(ma,ten,le_phi)")


def chung_thu_ky():
    """Khóa + chứng thư ký tài liệu (ca-init ghi vào OpenBao); đọc lại sau 10 phút để nhận bản gia hạn."""
    if not _KY_SO["gia_tri"] or time.time() - _KY_SO["luc"] > 600:
        try:
            _KY_SO.update(gia_tri=bimat.doc(f"tang2/{TANG2}/ky-so"), luc=time.time())
        except bimat.LoiBiMat as e:
            log.error("thiếu chứng thư ký số: %s", e)
            raise Loi(503, "Chưa có chứng thư ký số (ca-init chưa chạy?)") from None
    return _KY_SO["gia_tri"]


def _le_phi(so):
    return "Miễn lệ phí" if not so else f"{so:,} đồng".replace(",", ".")


def _du_lieu_giay_to(svc, hs, loai, co_quan):
    tt = hs.get("thu_tuc") or {}
    du_lieu = {"co_quan": co_quan, "ma_ho_so": hs["ma_ho_so"], "nguoi_nop": hs["ho_ten_nguoi_nop"],
               "thu_tuc": tt.get("ten"), "ma_thu_tuc": tt.get("ma"), "ngay_nhan": ky_so.ngay_vn(hs["ngay_nhan"]),
               "han_xu_ly": ky_so.ngay_vn(hs["han_xu_ly"]),
               "ngay_lap": ky_so.ngay_vn(datetime.datetime.now(datetime.timezone.utc).isoformat())}
    if loai == "bien_nhan":
        tep_hs = pgrst(svc, "GET", f"/thanh_phan_ho_so?ho_so_id=eq.{hs['id']}&object_key=not.is.null"
                       "&select=ten_tep,thanh_phan_yeu_cau:thanh_phan_yeu_cau_id(ten)&order=created_at")
        du_lieu.update(le_phi=_le_phi(tt.get("le_phi")),
                       thanh_phan=[(t.get("thanh_phan_yeu_cau") or {}).get("ten") or t["ten_tep"] for t in tep_hs])
    else:
        du_lieu.update(ngay_hoan_tat=ky_so.ngay_vn(hs["ngay_hoan_tat"]), ket_qua="Đã giải quyết – hoàn tất")
    return du_lieu


def phat_hanh(ho_so_id, loai, nguoi_sub):
    """Giấy tờ `loai` của hồ sơ: có rồi → (dòng, False); chưa có → sinh, ký, lưu → (dòng, True).
    Đọc/ghi bằng tài khoản dịch vụ tệp: người gọi phải kiểm quyền xem hồ sơ trước."""
    svc = DICH_VU_TEP.lay()
    duong = f"/giay_to_ky?ho_so_id=eq.{ho_so_id}&loai=eq.{loai}&select={_COT_GIAY_TO}"
    with _KHOA_PHAT_HANH:  # một tiến trình: không sinh hai lần cùng lúc
        co = pgrst(svc, "GET", duong)
        if co:
            return co[0], False
        rows = pgrst(svc, "GET", f"/ho_so?id=eq.{ho_so_id}&select={_COT_HS_GIAY_TO}")
        if not rows:
            raise Loi(404, "Không thấy hồ sơ")
        hs = rows[0]
        if loai == "ket_qua" and hs["trang_thai"] != "hoan_tat":
            raise Loi(409, "Hồ sơ chưa hoàn tất, chưa có kết quả")
        ky = chung_thu_ky()
        try:
            pdf = ky_so.html_sang_pdf(GOTENBERG_URL, ky_so.dung_html(loai, _du_lieu_giay_to(svc, hs, loai, ky["ten"])))
            da_ky = ky_so.ky_pdf(pdf, ky, ly_do=f"{ky_so.LOAI[loai]} {hs['ma_ho_so']}", noi_ky=ky["ten"])
        except ky_so.LoiKySo as e:
            log.error("không phát hành %s cho hồ sơ %s: %s", loai, hs["ma_ho_so"], e)
            raise Loi(503, "Chưa sinh được giấy tờ có ký số, thử lại sau") from None
        key = f"ho-so/{ho_so_id}/giay-to/{loai}-{uuid.uuid4()}.pdf"
        s3_goi("PUT", key, da_ky, {"Content-Type": "application/pdf"})
        dong = {"ho_so_id": ho_so_id, "loai": loai, "object_key": key, "sha256": hashlib.sha256(da_ky).hexdigest(),
                "kich_thuoc": len(da_ky), "chung_thu_ten": ky["ten"], "chung_thu_so_hieu": ky["so_hieu"],
                "nguoi_yeu_cau_sub": nguoi_sub}
        try:
            moi = pgrst(svc, "POST", f"/giay_to_ky?select={_COT_GIAY_TO}", dong, prefer="return=representation")[0]
        except Loi as e:
            try:
                s3_goi("DELETE", key)  # không để lại object không có metadata
            except Loi:
                log.error("không xóa được object mồ côi %s", key)
            if e.status == 409:  # tiến trình khác vừa phát hành
                return pgrst(svc, "GET", duong)[0], False
            raise
    log.info("phát hành %s cho hồ sơ %s (%d byte, sha256 %s)", loai, hs["ma_ho_so"], len(da_ky), dong["sha256"])
    return moi, True


def phat_hanh_nen(ho_so_id, loai, nguoi_sub):
    """Phát hành ở luồng nền sau khi Flowable đã chạy: không làm chậm hay hỏng request; lỗi thì
    người dùng bấm tải sau (POST /files/ho-so/{id}/giay-to/{loai}) sẽ phát hành lại."""
    def chay():
        try:
            phat_hanh(ho_so_id, loai, nguoi_sub)
        except Loi as e:
            log.error("phát hành nền %s cho hồ sơ %s lỗi: %s", loai, ho_so_id, e.thong_diep)
        except Exception:  # noqa: BLE001
            log.exception("phát hành nền %s cho hồ sơ %s lỗi", loai, ho_so_id)
    threading.Thread(target=chay, name=f"phat-hanh-{loai}", daemon=True).start()


def _kem_link(dong, ma_ho_so, ttl=FILE_LINK_TTL):
    c = s3()
    rows = pgrst(DICH_VU_TEP.lay(), "GET", f"/giay_to_ky?id=eq.{dong['id']}&select=object_key")
    url = tep.presign("GET", _url_object(rows[0]["object_key"]), c["region"], c["accessKeyId"],
                      c["secretAccessKey"], ttl, query_them={
                          "response-content-type": "application/pdf",
                          "response-content-disposition": tep.content_disposition(f"{dong['loai']}-{ma_ho_so}.pdf")})
    het_han = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=ttl)
    return {**dong, "maHoSo": ma_ho_so, "link": GATEWAY_URL + "/files/s3" + url[len(c["endpoint"]):],
            "hetHanLuc": het_han.isoformat(timespec="seconds")}


def tao_giay_to(token, claims, ho_so_id, loai):
    hs = _doc_ho_so(token, ho_so_id)  # 404 nếu RLS không cho xem
    if loai == "ket_qua" and hs["trang_thai"] != "hoan_tat":
        raise Loi(409, "Hồ sơ chưa hoàn tất, chưa có kết quả")
    if loai == "bien_nhan" and hs["trang_thai"] == "moi" and not _quy_trinh_cua(hs["ma_ho_so"]):
        raise Loi(409, "Hồ sơ chưa được tiếp nhận vào quy trình")
    dong, moi = phat_hanh(ho_so_id, loai, claims["sub"])
    return (201 if moi else 200), _kem_link(dong, hs["ma_ho_so"])


def ds_giay_to(token, claims, ho_so_id):
    thay = bool(pgrst(token, "GET", f"/ho_so?id=eq.{ho_so_id}&select=id"))
    tep.kiem_quyen_xem(vai_tro(claims), thay, thay or _ton_tai("ho_so", ho_so_id))
    return 200, pgrst(token, "GET", f"/giay_to_ky?ho_so_id=eq.{ho_so_id}&select={_COT_GIAY_TO}&order=ky_luc")


def xem_giay_to(token, claims, req, giay_to_id):
    rows = pgrst(token, "GET", f"/giay_to_ky?id=eq.{giay_to_id}&select={_COT_GIAY_TO},ho_so:ho_so_id(ma_ho_so)")
    tep.kiem_quyen_xem(vai_tro(claims), bool(rows), bool(rows) or _ton_tai("giay_to_ky", giay_to_id))
    ttl = _so(req.query.get("ttl", FILE_LINK_TTL), "ttl")
    if not 1 <= ttl <= FILE_LINK_TTL:
        raise Loi(400, f"ttl phải trong 1–{FILE_LINK_TTL} giây")
    dong = {k: v for k, v in rows[0].items() if k != "ho_so"}
    return 200, _kem_link(dong, rows[0]["ho_so"]["ma_ho_so"], ttl)


def xac_minh(token, claims, req):
    """Ai đăng nhập cũng xác minh được một PDF (ví dụ cán bộ nơi khác nhận biên nhận từ công dân)."""
    if (req.headers.get("Content-Type") or "").split(";")[0].strip().lower() != "application/pdf":
        raise Loi(415, "Body phải là PDF (Content-Type: application/pdf)")
    n = _so(req.headers.get("Content-Length"), "Content-Length")
    if n > FILE_MAX_BYTES:
        raise Loi(413, f"Tệp vượt {FILE_MAX_BYTES // (1024 * 1024)} MB")
    if n <= 0:
        raise Loi(400, "Tệp rỗng")
    pdf = req.rfile.read(n)
    kq = ky_so.xac_minh_pdf(pdf, chung_thu_ky()["goc_pem"])
    rows = pgrst(DICH_VU_TEP.lay(), "GET", f"/giay_to_ky?sha256=eq.{kq['sha256']}"
                 "&select=loai,ky_luc,ho_so:ho_so_id(ma_ho_so)")
    kq["phatHanh"] = ({"loai": rows[0]["loai"], "kyLuc": rows[0]["ky_luc"], "maHoSo": rows[0]["ho_so"]["ma_ho_so"]}
                      if rows else None)
    if not rows:
        vb = pgrst(DICH_VU_TEP.lay(), "GET", f"/van_ban?sha256=eq.{kq['sha256']}&chieu=eq.di&trang_thai=eq.da_ky"
                   "&select=ky_hieu,ky_luc,trich_yeu")
        if vb:
            kq["phatHanh"] = {"loai": "van_ban_di", "kyLuc": vb[0]["ky_luc"], "kyHieu": vb[0]["ky_hieu"],
                              "trichYeu": vb[0]["trich_yeu"]}
    log.info("xác minh PDF sha256 %s: hợp lệ %s, đã phát hành %s", kq["sha256"], kq["hopLe"], bool(kq["phatHanh"]))
    return 200, kq


# --- Sổ văn bản đến/đi (#78) ----------------------------------------------------------------
# Loại văn bản → ký hiệu viết tắt trong số ký hiệu văn bản đi (theo thói quen công văn hành chính).
KY_HIEU_LOAI = {"Thông báo": "TB", "Quyết định": "QĐ", "Kế hoạch": "KH", "Báo cáo": "BC", "Tờ trình": "TTr",
                "Giấy mời": "GM", "Công văn": "CV", "Biên bản": "BB"}
_COT_VAN_BAN = ("id,chieu,trang_thai,nam,so,ky_hieu,loai,ngay_van_ban,trich_yeu,noi_gui,noi_nhan,nguoi_ky,"
                "ten_tep,kich_thuoc,sha256,xac_minh_chu_ky,ky_luc,created_at")


def _can_vai(claims, *vai):
    if vai_tro(claims) not in vai:
        raise Loi(403, "Vai trò không được làm việc này với sổ văn bản")


def _chu(gia_tri, ten, toi_da, bat_buoc=True):
    v = (gia_tri or "").strip() if isinstance(gia_tri, str) or gia_tri is None else None
    if v is None:
        raise Loi(400, f"{ten} phải là chuỗi")
    if bat_buoc and not v:
        raise Loi(400, f"Thiếu {ten}")
    if len(v) > toi_da:
        raise Loi(400, f"{ten} dài quá {toi_da} ký tự")
    return v or None


def _ngay(gia_tri):
    try:
        return datetime.date.fromisoformat(gia_tri or "").isoformat()
    except ValueError:
        raise Loi(400, "ngay_van_ban phải dạng YYYY-MM-DD") from None


def vao_so_den(token, claims, req):
    _can_vai(claims, "van_thu")
    q = req.query
    meta = {"loai": _chu(q.get("loai"), "loai", 60), "ky_hieu": _chu(q.get("ky_hieu"), "ky_hieu", 60),
            "ngay_van_ban": _ngay(q.get("ngay_van_ban")), "trich_yeu": _chu(q.get("trich_yeu"), "trich_yeu", 500),
            "noi_gui": _chu(q.get("noi_gui"), "noi_gui", 300), "nguoi_ky": _chu(q.get("nguoi_ky"), "nguoi_ky", 200, False)}
    ten, duoi = tep.kiem_ten_tep(q.get("ten"))
    mime = tep.kiem_loai_khai_bao(duoi, req.headers.get("Content-Type"))
    n = _so(req.headers.get("Content-Length"), "Content-Length")
    if n > FILE_MAX_BYTES:
        raise Loi(413, f"Tệp vượt {FILE_MAX_BYTES // (1024 * 1024)} MB")
    if n <= 0:
        raise Loi(400, "Tệp rỗng")
    du_lieu = req.rfile.read(n)
    sach, ma_doc = tep.quet_clamav(CLAMAV_HOST, CLAMAV_PORT, du_lieu)
    if not sach:
        log.warning("chặn văn bản đến nhiễm %s của %s", ma_doc, claims["sub"])
        raise Loi(422, "Tệp chứa mã độc, đã từ chối và không lưu", {"maDoc": ma_doc})
    tep.kiem_magic(duoi, du_lieu)
    xac_minh_ck = None
    if duoi == "pdf":
        kq = ky_so.xac_minh_pdf(du_lieu, chung_thu_ky()["goc_pem"])
        xac_minh_ck = {k: kq.get(k) for k in ("coChuKy", "hopLe", "toanVen", "tinCay", "nguoiKy", "kyLuc", "loi")}
    nam = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).year
    key = f"van-ban/den/{nam}/{uuid.uuid4()}.{'jpg' if duoi == 'jpeg' else duoi}"
    s3_goi("PUT", key, du_lieu, {"Content-Type": mime})
    dong = {**meta, "chieu": "den", "ten_tep": ten, "loai_mime": mime, "kich_thuoc": n,
            "sha256": hashlib.sha256(du_lieu).hexdigest(), "object_key": key, "xac_minh_chu_ky": xac_minh_ck,
            "nguoi_tao_sub": claims["sub"]}
    try:
        moi = pgrst(DICH_VU_TEP.lay(), "POST", f"/van_ban?select={_COT_VAN_BAN}", dong, prefer="return=representation")[0]
    except Loi:
        try:
            s3_goi("DELETE", key)
        except Loi:
            log.error("không xóa được object mồ côi %s", key)
        raise
    log.info("vào sổ văn bản đến số %s/%s (%d byte)", moi["so"], moi["nam"], n)
    return 201, moi


def du_thao_di(token, claims, body):
    _can_vai(claims, "van_thu")
    dong = {"chieu": "di", "loai": _chu(body.get("loai"), "loai", 60),
            "trich_yeu": _chu(body.get("trich_yeu"), "trich_yeu", 500),
            "noi_nhan": _chu(body.get("noi_nhan"), "noi_nhan", 1000),
            "noi_dung": _chu(body.get("noi_dung"), "noi_dung", 20000), "nguoi_tao_sub": claims["sub"]}
    if dong["loai"] not in KY_HIEU_LOAI:
        raise Loi(400, "Loại văn bản đi không hỗ trợ", {"loai": sorted(KY_HIEU_LOAI)})
    return 201, pgrst(DICH_VU_TEP.lay(), "POST", f"/van_ban?select={_COT_VAN_BAN}", dong,
                      prefer="return=representation")[0]


def _co_quan(ky):
    """Tên cơ quan ban hành: phần trước " – " trong tên chứng thư ("UBND xã Mẫu – Bộ phận Một cửa")."""
    return ky["ten"].split(" – ")[0].strip()


def ky_van_ban(token, claims, van_ban_id):
    _can_vai(claims, "lanh_dao")
    svc = DICH_VU_TEP.lay()
    rows = pgrst(svc, "GET", f"/van_ban?id=eq.{van_ban_id}&select=id,chieu,trang_thai,loai,trich_yeu,noi_nhan,noi_dung")
    if not rows or rows[0]["chieu"] != "di":
        raise Loi(404, "Không thấy văn bản đi")
    vb = rows[0]
    if vb["trang_thai"] != "du_thao":
        raise Loi(409, "Văn bản đã ký ban hành")
    ky = chung_thu_ky()
    with _KHOA_PHAT_HANH:
        so = pgrst(svc, "POST", "/rpc/cap_so_van_ban_di",
                   {"p_id": van_ban_id, "p_ky_hieu_loai": KY_HIEU_LOAI.get(vb["loai"], "CV"), "p_co_quan": "UBND"})
        ngay = datetime.date.fromisoformat(so["ngayVanBan"])
        nguoi_ky = " ".join(x for x in (claims.get("family_name"), claims.get("given_name")) if x) \
            or claims.get("preferred_username") or claims["sub"]
        co_quan = _co_quan(ky)
        du_lieu = {"co_quan": co_quan, "ky_hieu": so["kyHieu"], "loai": vb["loai"].upper(), "trich_yeu": vb["trich_yeu"],
                   "noi_dung": vb["noi_dung"], "noi_nhan": vb["noi_nhan"], "nguoi_ky": nguoi_ky,
                   "chuc_vu": "TM. " + co_quan.upper(), "dia_danh": "Xã " + co_quan.split(" xã ")[-1] if " xã " in co_quan else co_quan,
                   "ngay_van_ban": f"{ngay.day:02d} tháng {ngay.month:02d} năm {ngay.year}"}
        try:
            pdf = ky_so.html_sang_pdf(GOTENBERG_URL, ky_so.dung_html("van_ban_di", du_lieu))
            da_ky = ky_so.ky_pdf(pdf, ky, ly_do=f"Ký ban hành văn bản {so['kyHieu']}", noi_ky=co_quan)
        except ky_so.LoiKySo as e:
            log.error("không ký được văn bản %s: %s", so["kyHieu"], e)
            raise Loi(503, "Chưa sinh/ký được văn bản, thử lại sau (số đã cấp được giữ)") from None
        key = f"van-ban/di/{so['nam']}/{uuid.uuid4()}.pdf"
        s3_goi("PUT", key, da_ky, {"Content-Type": "application/pdf"})
        cap_nhat = {"trang_thai": "da_ky", "nguoi_ky": nguoi_ky, "nguoi_ky_sub": claims["sub"],
                    "ten_tep": f"{so['kyHieu'].replace('/', '-')}.pdf", "loai_mime": "application/pdf",
                    "kich_thuoc": len(da_ky), "sha256": hashlib.sha256(da_ky).hexdigest(), "object_key": key,
                    "chung_thu_so_hieu": ky["so_hieu"],
                    "ky_luc": datetime.datetime.now(datetime.timezone.utc).isoformat()}
        try:
            moi = pgrst(svc, "PATCH", f"/van_ban?id=eq.{van_ban_id}&trang_thai=eq.du_thao&select={_COT_VAN_BAN}",
                        cap_nhat, prefer="return=representation")
        except Loi:
            moi = []
        if not moi:
            try:
                s3_goi("DELETE", key)
            except Loi:
                log.error("không xóa được object mồ côi %s", key)
            raise Loi(409, "Văn bản vừa được ký ở nơi khác hoặc không ghi được, tải lại sổ")
    log.info("ký ban hành văn bản %s (%d byte)", so["kyHieu"], len(da_ky))
    return 200, _kem_link_van_ban(moi[0])


def _kem_link_van_ban(dong, ttl=FILE_LINK_TTL):
    c = s3()
    rows = pgrst(DICH_VU_TEP.lay(), "GET", f"/van_ban?id=eq.{dong['id']}&select=object_key,loai_mime,ten_tep")
    if not rows or not rows[0]["object_key"]:
        raise Loi(404, "Văn bản chưa có tệp (dự thảo chưa ký)")
    r = rows[0]
    url = tep.presign("GET", _url_object(r["object_key"]), c["region"], c["accessKeyId"], c["secretAccessKey"], ttl,
                      query_them={"response-content-type": r["loai_mime"],
                                  "response-content-disposition": tep.content_disposition(r["ten_tep"])})
    het_han = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=ttl)
    return {**dong, "link": GATEWAY_URL + "/files/s3" + url[len(c["endpoint"]):],
            "hetHanLuc": het_han.isoformat(timespec="seconds")}


def xem_van_ban(token, claims, req, van_ban_id):
    _can_vai(claims, "can_bo", "lanh_dao", "van_thu")
    rows = pgrst(token, "GET", f"/van_ban?id=eq.{van_ban_id}&select={_COT_VAN_BAN}")  # RLS của người gọi
    if not rows:
        raise Loi(404, "Không thấy văn bản")
    ttl = _so(req.query.get("ttl", FILE_LINK_TTL), "ttl")
    if not 1 <= ttl <= FILE_LINK_TTL:
        raise Loi(400, f"ttl phải trong 1–{FILE_LINK_TTL} giây")
    return 200, _kem_link_van_ban(rows[0], ttl)


# --- Đọc giấy tờ bằng OCR, cán bộ xác nhận (#93) ------------------------------------------
LOAI_GIAY_TO = doc_giay_to.doc_loai()
_COT_DOC = ("tep_id,ho_so_id,loai,trang_thai,truong_may,mo_hinh,doc_luc,loi_doc,truong_cong_dan,khai_luc,"
            "truong_xac_nhan,truong_da_sua,xac_nhan_boi_sub,xac_nhan_luc")
_ANH = {"image/png": "png", "image/jpeg": "jpeg"}


def goi_ocr(du_lieu):
    """Ảnh → {"dong": [...], "mo_hinh": …} từ dịch vụ OCR của nền tảng. Chưa bật/chưa sẵn sàng → 503."""
    req = urllib.request.Request(OCR_URL + "/doc", data=du_lieu, method="POST",
                                 headers={"Content-Type": "application/octet-stream"})
    try:
        with urllib.request.urlopen(req, timeout=OCR_TIMEOUT) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code == 503:
            raise Loi(503, "Dịch vụ đọc giấy tờ đang nạp mô hình, vui lòng thử lại sau ít phút") from None
        if e.code in (413, 415, 422):
            raise Loi(422, "Không đọc được chữ trên ảnh này. Hãy chụp lại rõ, thẳng, đủ sáng") from None
        log.error("dịch vụ OCR → %s", e.code)
        raise Loi(502, "Dịch vụ đọc giấy tờ trả lỗi") from None
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        log.warning("không gọi được dịch vụ OCR: %s", e)
        raise Loi(503, "Chức năng đọc giấy tờ chưa bật trên máy chủ này (dịch vụ OCR, profile ai)") from None


def _doc_va_trich(du_lieu, loai):
    kq = goi_ocr(du_lieu)
    dong = [{"chu": d.get("chu", ""), "tin_cay": d.get("tin_cay")} for d in kq.get("dong") or []]
    return doc_giay_to.trich_truong(dong, LOAI_GIAY_TO[loai]), dong, kq.get("mo_hinh")


def _ghi_doc(dong):
    """Upsert một dòng doc_giay_to bằng tài khoản dịch vụ tệp; chỉ đụng cột có trong dong."""
    rows = pgrst(DICH_VU_TEP.lay(), "POST", f"/doc_giay_to?on_conflict=tep_id&select={_COT_DOC}", dong,
                 prefer="resolution=merge-duplicates,return=representation")
    return rows[0]


def _tep_cua(token, tep_id):
    """Tệp theo RLS của người gọi + mã thành phần + hồ sơ. Không thấy → 403/404 như xem tệp."""
    rows = pgrst(token, "GET", f"/thanh_phan_ho_so?id=eq.{tep_id}&select=id,ho_so_id,loai_mime,object_key,"
                               "thanh_phan_yeu_cau:thanh_phan_yeu_cau_id(ma),ho_so:ho_so_id(trang_thai,nguoi_nop_sub)")
    return rows[0] if rows else None


def _loai_cua(r):
    loai = (r.get("thanh_phan_yeu_cau") or {}).get("ma")
    if loai not in LOAI_GIAY_TO:
        raise Loi(422, "Thành phần hồ sơ này không có mẫu đọc giấy tờ")
    return loai


def doc_nen(tep_id, du_lieu=None):
    """Máy đọc tệp đã lưu ở luồng nền (sau khi tải lên): không làm chậm hay hỏng request. Thành phần không có
    mẫu đọc thì bỏ qua; OCR chưa bật thì chỉ ghi log, cán bộ vẫn nhập tay khi xác nhận."""
    def chay():
        try:
            svc = DICH_VU_TEP.lay()
            r = pgrst(svc, "GET", f"/thanh_phan_ho_so?id=eq.{tep_id}&select=id,ho_so_id,object_key,loai_mime,"
                                  "thanh_phan_yeu_cau:thanh_phan_yeu_cau_id(ma)")[0]
            loai = (r.get("thanh_phan_yeu_cau") or {}).get("ma")
            if loai not in LOAI_GIAY_TO or r["loai_mime"] not in _ANH:
                return
            noi_dung = du_lieu if du_lieu is not None else s3_doc(r["object_key"])
            try:
                truong, dong, mo_hinh = _doc_va_trich(noi_dung, loai)
                _ghi_doc({"tep_id": tep_id, "ho_so_id": r["ho_so_id"], "loai": loai, "truong_may": truong,
                          "dong_may": dong, "mo_hinh": mo_hinh})
                log.info("máy đọc tệp %s (%s): %d trường", tep_id, loai, len(truong))
            except Loi as e:
                _ghi_doc({"tep_id": tep_id, "ho_so_id": r["ho_so_id"], "loai": loai, "loi_doc": e.thong_diep})
                log.warning("máy chưa đọc được tệp %s: %s", tep_id, e.thong_diep)
        except Loi as e:
            log.error("đọc nền tệp %s lỗi: %s", tep_id, e.thong_diep)
        except Exception:  # noqa: BLE001
            log.exception("đọc nền tệp %s lỗi", tep_id)
    threading.Thread(target=chay, name="doc-giay-to", daemon=True).start()


def ds_loai_giay_to(token, claims, req):
    return 200, doc_giay_to.cong_khai(LOAI_GIAY_TO)


def doc_thu(token, claims, req):
    """Đọc thử một ảnh để tự điền form (công dân ở bước nộp): quét ClamAV, kiểm loại, OCR, trích trường. KHÔNG
    lưu ảnh hay kết quả; giá trị chỉ có hiệu lực khi công dân gửi (khai) và cán bộ xác nhận."""
    loai = req.query.get("loai") or ""
    if loai not in LOAI_GIAY_TO:
        raise Loi(404, "Không có mẫu đọc cho loại giấy tờ này")
    duoi = _ANH.get((req.headers.get("Content-Type") or "").split(";", 1)[0].strip().lower())
    if not duoi:
        raise Loi(415, "Chỉ đọc được ảnh JPG hoặc PNG")
    n = _so(req.headers.get("Content-Length") or 0, "Content-Length")
    if n > FILE_MAX_BYTES:
        raise Loi(413, f"Ảnh vượt {FILE_MAX_BYTES // (1024 * 1024)} MB")
    if n <= 0:
        raise Loi(400, "Ảnh rỗng")
    du_lieu = req.rfile.read(n)
    sach, ma_doc = tep.quet_clamav(CLAMAV_HOST, CLAMAV_PORT, du_lieu)
    if not sach:
        log.warning("chặn ảnh nhiễm %s gửi đọc thử của %s", ma_doc, claims["sub"])
        raise Loi(422, "Tệp chứa mã độc, đã từ chối", {"maDoc": ma_doc})
    tep.kiem_magic(duoi, du_lieu)
    truong, _, mo_hinh = _doc_va_trich(du_lieu, loai)
    return 200, {"loai": loai, "truong": truong, "mo_hinh": mo_hinh}


def khai_giay_to(token, claims, body, tep_id):
    """Công dân gửi các trường đã xem/sửa cho tệp của hồ sơ mình (khi mới nộp hoặc chờ bổ sung)."""
    if vai_tro(claims) != "cong_dan":
        raise Loi(403, "Chỉ công dân khai thông tin giấy tờ")
    r = _tep_cua(token, tep_id)
    if not r:
        raise Loi(404, "Không thấy tệp")
    hs = r.get("ho_so") or {}
    if hs.get("nguoi_nop_sub") != claims["sub"]:
        raise Loi(403, "Chỉ người nộp được khai thông tin giấy tờ")
    if hs.get("trang_thai") not in tep.TRANG_THAI_NHAN_TEP:
        raise Loi(409, "Hồ sơ không còn nhận thay đổi (chỉ khi mới nộp hoặc chờ bổ sung)")
    loai = _loai_cua(r)
    try:
        truong = doc_giay_to.kiem_truong_gui(LOAI_GIAY_TO[loai], body.get("truong"))
    except doc_giay_to.LoiDuLieu as e:
        raise Loi(400, str(e)) from None
    try:
        return 200, _ghi_doc({"tep_id": tep_id, "ho_so_id": r["ho_so_id"], "loai": loai, "truong_cong_dan": truong})
    except Loi as e:
        if e.status == 403:
            raise Loi(409, "Cán bộ đã xác nhận thông tin giấy tờ này, không khai lại được") from None
        raise


def _can_bo_xem_tep(token, claims, tep_id):
    if vai_tro(claims) not in ("can_bo", "lanh_dao"):
        raise Loi(403, "Chỉ cán bộ, lãnh đạo xác nhận giấy tờ")
    r = _tep_cua(token, tep_id)
    if not r:
        raise Loi(403, "Không có quyền với tệp này") if _ton_tai("thanh_phan_ho_so", tep_id) else Loi(404, "Không thấy tệp")
    return r


def doc_lai(token, claims, tep_id):
    """Cán bộ cho máy đọc lại tệp đã lưu (đồng bộ) – ví dụ khi OCR mới bật hay lần đọc nền lỗi."""
    r = _can_bo_xem_tep(token, claims, tep_id)
    loai = _loai_cua(r)
    if r["loai_mime"] not in _ANH:
        raise Loi(415, "Chỉ đọc được ảnh JPG hoặc PNG")
    truong, dong, mo_hinh = _doc_va_trich(s3_doc(r["object_key"]), loai)
    try:
        return 200, _ghi_doc({"tep_id": tep_id, "ho_so_id": r["ho_so_id"], "loai": loai, "truong_may": truong,
                              "dong_may": dong, "mo_hinh": mo_hinh})
    except Loi as e:
        if e.status == 403:
            raise Loi(409, "Giấy tờ đã được xác nhận, không đọc lại") from None
        raise


def xac_nhan_giay_to(token, claims, body, tep_id):
    """Cán bộ chốt giá trị các trường sau khi so ảnh gốc (HITL). Chỉ giá trị này được dùng; ghi kiểm toán."""
    r = _can_bo_xem_tep(token, claims, tep_id)
    loai = _loai_cua(r)
    try:
        truong = doc_giay_to.kiem_truong_gui(LOAI_GIAY_TO[loai], body.get("truong"))
    except doc_giay_to.LoiDuLieu as e:
        raise Loi(400, str(e)) from None
    if not truong:
        raise Loi(400, "Cần ít nhất một trường đã kiểm")
    try:
        moi = _ghi_doc({"tep_id": tep_id, "ho_so_id": r["ho_so_id"], "loai": loai, "trang_thai": "da_xac_nhan",
                        "truong_xac_nhan": truong, "xac_nhan_boi_sub": claims["sub"]})
    except Loi as e:
        if e.status == 403:
            raise Loi(409, "Giấy tờ đã được xác nhận trước đó") from None
        raise
    log.info("cán bộ xác nhận giấy tờ %s (%s): sửa %s", tep_id, loai, moi.get("truong_da_sua"))
    return 200, moi


# --- Wiki văn bản nội bộ cho cán bộ (#95) -----------------------------------------------
WIKI = wiki.Kho(tri_thuc.Meili(wiki.TEN_INDEX))


def _linh_vuc_cua(token, claims):
    """Id các lĩnh vực cán bộ đang phụ trách (đọc bằng token của chính họ)."""
    sub = urllib.parse.quote(claims["sub"])
    rows = pgrst(token, "GET", f"/can_bo?sub=eq.{sub}&dang_lam_viec=is.true&select=linh_vuc(id)")
    return sorted({lv["id"] for r in rows for lv in r.get("linh_vuc") or []})


def tim_wiki(token, claims, req):
    vai = vai_tro(claims)
    if vai not in wiki.VAI_DOC:
        raise Loi(403, "Chỉ cán bộ, lãnh đạo, văn thư tra cứu văn bản nội bộ")
    q = (req.query.get("q") or "").strip()
    if len(q) > 200:
        raise Loi(400, "Từ khóa dài quá 200 ký tự")
    loai = req.query.get("loai") or None
    if loai and loai not in wiki.LOAI:
        raise Loi(400, "Loại văn bản không hợp lệ")
    tat_ca = req.query.get("tat_ca") in ("1", "true")
    so_luong = min(max(_so(req.query.get("so_luong") or 20, "so_luong"), 1), 50)
    tu = min(max(_so(req.query.get("tu") or 0, "tu"), 0), 1000)
    linh_vuc = _linh_vuc_cua(token, claims) if vai == "can_bo" else []
    try:
        hits, tong = WIKI.tim(q, wiki.bo_loc(vai, linh_vuc, loai, tat_ca), so_luong, tu)
        nguon = "meilisearch"
        ket_qua = [wiki.ket_qua_meili(h) for h in hits]
    except tri_thuc.LoiKhoTriThuc as e:
        log.warning("tìm wiki bằng Meilisearch lỗi, tìm trong CSDL: %s", e)
        rows = pgrst(token, "POST", "/rpc/tim_wiki", {"p_q": q, "p_tat_ca": tat_ca, "p_so_luong": 100})
        rows = [r for r in rows if not loai or r["loai"] == loai]
        tong, nguon = len(rows), "csdl"
        ket_qua = [wiki.ket_qua_csdl(r, q) for r in rows[tu:tu + so_luong]]
    if ket_qua and nguon == "meilisearch":
        # Đối chiếu RLS: chỉ mục có thể chậm một nhịp sau khi đổi phạm vi hay phân công.
        ids = ",".join(k["id"] for k in ket_qua)
        thay = {r["id"] for r in pgrst(token, "GET", f"/wiki_van_ban?id=in.({ids})&select=id")}
        bo = len(ket_qua) - len(thay)
        if bo:
            log.warning("tìm wiki: bỏ %d kết quả chỉ mục mà RLS không cho xem", bo)
            ket_qua = [k for k in ket_qua if k["id"] in thay]
            tong = max(tong - bo, len(ket_qua))
    return 200, {"ket_qua": ket_qua, "tong": tong, "nguon": nguon, "q": q}


def _cap_nhat_chi_muc(dong):
    try:
        WIKI.cap_nhat(dong)
    except tri_thuc.LoiKhoTriThuc as e:  # chỉ mục sẽ được dựng lại ở vòng đồng bộ sau
        log.warning("chưa cập nhật chỉ mục wiki cho %s: %s", dong["id"], e)


def ghi_wiki(token, claims, body, van_ban_id=None):
    if vai_tro(claims) not in wiki.VAI_GHI:
        raise Loi(403, "Chỉ văn thư, lãnh đạo thêm hoặc sửa văn bản nội bộ")
    try:
        dong = wiki.kiem_du_lieu(body, moi=van_ban_id is None)
    except wiki.LoiDuLieu as e:
        raise Loi(400, str(e)) from None
    try:
        if van_ban_id is None:
            rows = pgrst(token, "POST", f"/wiki_van_ban?select={wiki.COT}", dong, prefer="return=representation")
        else:
            rows = pgrst(token, "PATCH", f"/wiki_van_ban?id=eq.{van_ban_id}&select={wiki.COT}", dong,
                         prefer="return=representation")
    except Loi as e:
        if e.status in (401, 403) or (e.chi_tiet or {}).get("code") == "42501":
            raise Loi(403, "Không có quyền ghi văn bản ở phạm vi này") from None
        if e.status == 400 and (e.chi_tiet or {}).get("code") in ("23503", "23514"):
            raise Loi(400, "Dữ liệu văn bản không hợp lệ (lĩnh vực không tồn tại hoặc phạm vi không khớp)") from None
        raise
    if not rows:
        raise Loi(404, "Không thấy văn bản hoặc không có quyền sửa")
    _cap_nhat_chi_muc(rows[0])
    return (201 if van_ban_id is None else 200), rows[0]


def dong_bo_wiki():
    """Dựng lại toàn bộ chỉ mục từ CSDL bằng tài khoản dịch vụ tệp (chỉ đọc wiki)."""
    rows = pgrst(DICH_VU_TEP.lay(), "GET", f"/wiki_van_ban?select={wiki.COT}&order=id&limit=10000")
    return WIKI.dong_bo(rows)


def vong_dong_bo_wiki():
    """Luồng nền: đồng bộ ngay khi khởi động (thử lại tới khi được), rồi định kỳ."""
    cho = 5
    while True:
        try:
            kq = dong_bo_wiki()
            log.info("đồng bộ chỉ mục wiki: %d văn bản, xóa %d tài liệu thừa", kq["so_tai_lieu"], kq["da_xoa"])
            cho = WIKI_DONG_BO_GIAY
        except (Loi, tri_thuc.LoiKhoTriThuc) as e:
            log.warning("chưa đồng bộ được chỉ mục wiki: %s", getattr(e, "thong_diep", e))
            cho = min(cho * 2, 60) if cho < WIKI_DONG_BO_GIAY else 5
        except Exception:  # noqa: BLE001 – luồng nền không được chết
            log.exception("đồng bộ chỉ mục wiki lỗi")
            cho = 60
        time.sleep(cho)


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
    # Giấy tờ có ký số (#77).
    ("GET", re.compile(rf"/files/ho-so/({UUID})/giay-to"), False, lambda tk, c, r, m: ds_giay_to(tk, c, m[1])),
    ("POST", re.compile(rf"/files/ho-so/({UUID})/giay-to/(bien_nhan|ket_qua)"), False,
     lambda tk, c, r, m: tao_giay_to(tk, c, m[1], m[2])),
    ("GET", re.compile(rf"/files/giay-to/({UUID})"), False, lambda tk, c, r, m: xem_giay_to(tk, c, r, m[1])),
    ("POST", re.compile(r"/files/xac-minh"), False, lambda tk, c, r, m: xac_minh(tk, c, r)),
    # Sổ văn bản (#78).
    ("POST", re.compile(r"/files/van-ban/den"), False, lambda tk, c, r, m: vao_so_den(tk, c, r)),
    ("POST", re.compile(r"/files/van-ban/di"), True, lambda tk, c, b, m: du_thao_di(tk, c, b)),
    ("POST", re.compile(rf"/files/van-ban/({UUID})/ky"), True, lambda tk, c, b, m: ky_van_ban(tk, c, m[1])),
    ("GET", re.compile(rf"/files/van-ban/({UUID})"), False, lambda tk, c, r, m: xem_van_ban(tk, c, r, m[1])),
    # Đọc giấy tờ bằng OCR, cán bộ xác nhận (#93).
    ("GET", re.compile(r"/files/doc-giay-to/loai"), False, lambda tk, c, r, m: ds_loai_giay_to(tk, c, r)),
    ("POST", re.compile(r"/files/doc-giay-to"), False, lambda tk, c, r, m: doc_thu(tk, c, r)),
    ("POST", re.compile(rf"/files/tep/({UUID})/khai"), True, lambda tk, c, b, m: khai_giay_to(tk, c, b, m[1])),
    ("POST", re.compile(rf"/files/tep/({UUID})/doc"), True, lambda tk, c, b, m: doc_lai(tk, c, m[1])),
    ("POST", re.compile(rf"/files/tep/({UUID})/xac-nhan"), True, lambda tk, c, b, m: xac_nhan_giay_to(tk, c, b, m[1])),
    # Wiki văn bản nội bộ cho cán bộ (#95).
    ("GET", re.compile(r"/files/wiki/tim"), False, lambda tk, c, r, m: tim_wiki(tk, c, r)),
    ("POST", re.compile(r"/files/wiki"), True, lambda tk, c, b, m: ghi_wiki(tk, c, b)),
    ("POST", re.compile(rf"/files/wiki/({UUID})"), True, lambda tk, c, b, m: ghi_wiki(tk, c, b, m[1])),
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
            if method == "GET" and path == "/thong-bao/luong":
                return self._luong_thong_bao(*kiem_token(self.headers.get("Authorization")))
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

    def _luong_thong_bao(self, token, claims):
        """SSE (#56): giữ kết nối tới khi token hết hạn hoặc trình duyệt đóng. Lỗi trước khi gửi header →
        JSON như mọi endpoint; sau đó chỉ còn đóng kết nối."""
        if vai_tro(claims) not in ("can_bo", "lanh_dao"):
            raise Loi(403, "Chỉ cán bộ, lãnh đạo nhận thông báo")

        def lay():
            return thong_bao.trang_thai(pgrst(token, "GET", "/thong_bao?da_doc_luc=is.null&select=id"
                                                            "&order=tao_luc.desc,id&limit=100"))

        dau = lay()  # lỗi quyền/CSDL → trả JSON trước khi mở luồng
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Accel-Buffering", "no")  # nginx của APISIX không gom phản hồi
        self.end_headers()

        def gui(b):
            self.wfile.write(b)
            self.wfile.flush()

        try:
            thong_bao.theo_doi(lay, gui, float(claims.get("exp", 0)), dau=dau)
        except (BrokenPipeError, ConnectionResetError):
            pass  # trình duyệt đóng tab
        except Loi as e:
            log.warning("luồng thông báo dừng: %s", e.thong_diep)
        self.close_connection = True

    def do_GET(self):
        self._xu_ly("GET")

    def do_POST(self):
        self._xu_ly("POST")

    def log_message(self, fmt, *args):  # không ghi query string (tên tệp, chữ ký…)
        log.info("%s %s %s", self.command, urllib.parse.urlsplit(self.path).path, args[1] if len(args) > 1 else "")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    log.info("API quy trình mot-cua nghe cổng %d, Flowable %s", PORT, FLOWABLE_URL)
    threading.Thread(target=vong_dong_bo_wiki, name="dong-bo-wiki", daemon=True).start()
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
