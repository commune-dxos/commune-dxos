# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Hộp thư đi sự kiện (transactional outbox, #9) và nhật ký sự kiện qua PostgREST, bằng tài
khoản dịch vụ Keycloak `mot_cua_su_kien` (role PostgreSQL dich_vu_su_kien,
db/migrations/004_su_kien.sql). Dùng chung cho mot-cua-api (ghi sự kiện sau khi gọi Flowable
thành công) và mot-cua-worker (quét sắp trễ hạn, đối soát trạng thái, phát lên RabbitMQ, consumer
mẫu). Đổi trạng thái hồ sơ + lịch sử + sự kiện cùng một transaction: dong_bo() (RPC
dong_bo_trang_thai, db/migrations/006_trang_thai_theo_quy_trinh.sql, #73).

Vì sao outbox: ghi sự kiện vào PostgreSQL rồi mot-cua-worker mới phát lên RabbitMQ, nên request
của người dùng không phụ thuộc broker (RabbitMQ dừng → sự kiện chờ trong bảng, phát khi broker
lên lại), và phát lại không bao giờ sinh sự kiện mới (id giữ nguyên, consumer chống trùng).

Client secret đọc từ OpenBao (bimat.py, dxos/tang2/<DXOS_TANG2>/keycloak/mot_cua_su_kien).
"""

import json
import logging
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

import bimat
import su_kien

POSTGREST_URL = os.environ.get("DXOS_POSTGREST_URL", "http://postgrest:3000")
TOKEN_URL = os.environ.get("DXOS_TOKEN_URL", "http://keycloak:8080/realms/dxos/protocol/openid-connect/token")
TANG2 = os.environ.get("DXOS_TANG2", "mot-cua")
CLIENT = "mot_cua_su_kien"
# Cột hồ sơ tài khoản dịch vụ được đọc: không có dữ liệu cá nhân của người nộp.
COT_HO_SO = "id,ma_ho_so,trang_thai,han_xu_ly,thu_tuc:thu_tuc_id(ma,linh_vuc:linh_vuc_id(ma))"

log = logging.getLogger("mot-cua-su-kien")


class LoiHopThu(Exception):
    """Không đọc/ghi được hộp thư hay nhật ký sự kiện (thông điệp không chứa bí mật). status = mã HTTP
    của PostgREST nếu có (400: dữ liệu sai, gửi lại cũng không được)."""

    def __init__(self, thong_diep, status=None):
        super().__init__(thong_diep)
        self.status = status


def _goi(method, url, body=None, headers=None, form=None):
    data = form if form is not None else (None if body is None else json.dumps(body).encode())
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    if body is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            raw, status = r.read(), r.status
    except urllib.error.HTTPError as e:
        raw, status = e.read(), e.code
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise LoiHopThu(f"không gọi được {url.split('?')[0]}: {e}") from None
    try:
        return status, (json.loads(raw) if raw else None)
    except ValueError:
        return status, None


class _Token:
    """Access token Client Credentials của mot_cua_su_kien, lưu đệm tới gần hết hạn."""

    def __init__(self):
        self.token, self.het_han, self.lock = None, 0.0, threading.Lock()

    def lay(self):
        with self.lock:
            if self.token and time.time() < self.het_han - 30:
                return self.token
            try:
                bi_mat = bimat.doc(f"tang2/{TANG2}/keycloak/{CLIENT}")["secret"]
            except (bimat.LoiBiMat, KeyError) as e:
                raise LoiHopThu(f"thiếu secret của client {CLIENT}: {e}") from None
            form = urllib.parse.urlencode({"grant_type": "client_credentials", "client_id": CLIENT,
                                           "client_secret": bi_mat}).encode()
            status, data = _goi("POST", TOKEN_URL, form=form)
            if status != 200 or not data:
                raise LoiHopThu(f"không lấy được token dịch vụ {CLIENT} (HTTP {status})")
            self.token, self.het_han = data["access_token"], time.time() + int(data.get("expires_in", 60))
            return self.token

    def bo(self):
        with self.lock:
            self.token = None


TOKEN = _Token()


def pgrst(method, path, body=None, prefer=None):
    """PostgREST bằng token dịch vụ → JSON. Lỗi → LoiHopThu."""
    h = {"Authorization": f"Bearer {TOKEN.lay()}", "Accept": "application/json"}
    if prefer:
        h["Prefer"] = prefer
    status, data = _goi(method, POSTGREST_URL + path, body, h)
    if status == 401:
        TOKEN.bo()
    if status >= 400:
        msg = data.get("message") if isinstance(data, dict) else None
        raise LoiHopThu(f"PostgREST {method} {path.split('?')[0]} → {status} {msg or ''}".rstrip(), status)
    return data


def ngu_canh(ho_so_ids):
    """→ {id: dòng ho_so (COT_HO_SO)} cho các hồ sơ tồn tại."""
    if not ho_so_ids:
        return {}
    ds = ",".join(sorted(set(ho_so_ids)))
    return {r["id"]: r for r in pgrst("GET", f"/ho_so?id=in.({ds})&select={COT_HO_SO}")}


def ghi(loai, ho_so_id, du_lieu=None, khoa_chong_trung=None, ho_so=None):
    """Tạo sự kiện và ghi vào hộp thư đi. → sự kiện, hoặc None nếu trùng khóa chống trùng
    (đã có sự kiện này rồi). Lỗi → LoiHopThu."""
    if ho_so is None:
        ho_so = ngu_canh([ho_so_id]).get(ho_so_id)
        if not ho_so:
            raise LoiHopThu(f"không thấy hồ sơ {ho_so_id}")
    ev = su_kien.tao(loai, ho_so, du_lieu)
    rows = pgrst("POST", "/hop_thu_su_kien?on_conflict=khoa_chong_trung&select=id",
                 su_kien.dong_hop_thu(ev, khoa_chong_trung),
                 prefer="resolution=ignore-duplicates,return=representation")
    if not rows:
        return None
    log.info("sự kiện %s %s (%s) → hộp thư đi", ev["loai"], ev["maHoSo"], ev["id"])
    return ev


def dong_bo(ho_so_id, trang_thai_moi, cac_su_kien, ly_do=None, buoc=None, nguon="quy_trinh", nguoi_sub=None):
    """RPC mot_cua.dong_bo_trang_thai (#73): đổi trạng thái hồ sơ (None = giữ nguyên), ghi lịch sử
    và các sự kiện [(sự kiện, khóa chống trùng)] vào hộp thư đi trong MỘT transaction của CSDL.
    → {"trangThaiTruoc", "trangThai", "daDoi", "soSuKien"}. Lỗi → LoiHopThu (không ghi gì)."""
    kq = pgrst("POST", "/rpc/dong_bo_trang_thai", {
        "p_ho_so_id": ho_so_id, "p_trang_thai": trang_thai_moi, "p_ly_do": ly_do, "p_buoc": buoc,
        "p_nguon": nguon, "p_nguoi_sub": nguoi_sub,
        "p_su_kien": [su_kien.dong_hop_thu(ev, khoa) for ev, khoa in cac_su_kien]})
    if not isinstance(kq, dict):
        raise LoiHopThu("RPC dong_bo_trang_thai trả kết quả lạ")
    for ev, _ in cac_su_kien:
        log.info("sự kiện %s %s (%s) → hộp thư đi", ev["loai"], ev["maHoSo"], ev["id"])
    return kq


def chua_phat(gioi_han=50):
    """Các dòng chưa phát, cũ nhất trước."""
    return pgrst("GET", "/hop_thu_su_kien?da_phat_luc=is.null&select=id,loai,noi_dung,so_lan_thu"
                        f"&order=tao_luc.asc,id.asc&limit={int(gioi_han)}")


def da_phat(ma):
    pgrst("PATCH", f"/hop_thu_su_kien?id=eq.{ma}&da_phat_luc=is.null",
          {"da_phat_luc": su_kien.bay_gio().isoformat(), "loi_cuoi": None}, prefer="return=minimal")


def phat_loi(ma, so_lan_thu, loi):
    pgrst("PATCH", f"/hop_thu_su_kien?id=eq.{ma}&da_phat_luc=is.null",
          {"so_lan_thu": so_lan_thu, "loi_cuoi": str(loi)[:500]}, prefer="return=minimal")


def ghi_nhat_ky(ev):
    """Consumer mẫu: ghi sự kiện đã nhận; nhận lại cùng id (giao lại) thì bỏ qua.
    → True nếu là lần đầu."""
    rows = pgrst("POST", "/nhat_ky_su_kien?on_conflict=su_kien_id&select=su_kien_id", su_kien.dong_nhat_ky(ev),
                 prefer="resolution=ignore-duplicates,return=representation")
    return bool(rows)


def ghi_thong_bao(ev, kenh=()):
    """Consumer thông báo (#56): RPC ghi_thong_bao_sap_tre (migration 013) ghi mỗi cán bộ phụ trách lĩnh
    vực của hồ sơ một thông báo, chống trùng theo (cán bộ, hồ sơ, mốc hạn); kênh ngoài chỉ ghi giả lập.
    → {"moi", "nguoiNhan"[, "boQua"]}. Lỗi → LoiHopThu (sự kiện sai: HTTP 400)."""
    kq = pgrst("POST", "/rpc/ghi_thong_bao_sap_tre", {"p_su_kien": ev, "p_kenh": list(kenh)})
    if not isinstance(kq, dict):
        raise LoiHopThu("RPC ghi_thong_bao_sap_tre trả kết quả lạ")
    return kq
