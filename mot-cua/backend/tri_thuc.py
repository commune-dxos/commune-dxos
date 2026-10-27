# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Kho tri thức của trợ lý thủ tục (#91): gọi Meilisearch và PostgREST, dùng chung cho dịch vụ tro-ly
(tro_ly.py) và bộ nạp nap-tri-thuc (nap_tri_thuc.py). Chỉ thư viện chuẩn.

- Meilisearch (tìm từ khóa): địa chỉ + khóa API riêng của Tầng 2 + tiền tố index do meili-init của nền
  tảng ghi vào OpenBao dxos/tang2/<DXOS_TANG2>/meilisearch; khóa chỉ dùng được trên index `<DXOS_TANG2>-*`.
- PostgREST (đoạn + vector, pgvector): token Client Credentials của client mot_cua_tro_ly (role
  dich_vu_tro_ly, chỉ chạm bảng tri_thuc_doan và RPC tim_doan_gan). Client secret do tang2-realm ghi vào
  OpenBao dxos/tang2/<DXOS_TANG2>/keycloak/mot_cua_tro_ly.
Bí mật chỉ nằm trong bộ nhớ (bimat.py), không in ra log.
"""

import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

import bimat

TANG2 = os.environ.get("DXOS_TANG2", "mot-cua")
POSTGREST_URL = os.environ.get("DXOS_POSTGREST_URL", "http://postgrest:3000")
TOKEN_URL = os.environ.get("DXOS_TOKEN_URL", "http://keycloak:8080/realms/dxos/protocol/openid-connect/token")
CLIENT = "mot_cua_tro_ly"
TEN_INDEX = "tri-thuc"
COT_DOAN = "id,nguon,ma_thu_tuc,tieu_de,noi_dung,lien_ket"


class LoiKhoTriThuc(Exception):
    """Không gọi được Meilisearch/PostgREST/OpenBao (thông điệp không chứa bí mật)."""

    def __init__(self, thong_diep, status=None):
        super().__init__(thong_diep)
        self.status = status


def goi(method, url, body=None, headers=None, form=None, timeout=15):
    """→ (mã HTTP, JSON hoặc None). Lỗi kết nối → LoiKhoTriThuc."""
    data = form if form is not None else (None if body is None else json.dumps(body).encode())
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    if body is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw, status = r.read(), r.status
    except urllib.error.HTTPError as e:
        raw, status = e.read(), e.code
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise LoiKhoTriThuc(f"không gọi được {url.split('?')[0]}: {e}") from None
    try:
        return status, (json.loads(raw) if raw else None)
    except ValueError:
        return status, None


def _bi_mat(duong):
    try:
        return bimat.doc(duong)
    except bimat.LoiBiMat as e:
        raise LoiKhoTriThuc(f"thiếu bí mật {duong}: {e}") from None


class TokenDichVu:
    """Access token Client Credentials của mot_cua_tro_ly, lưu đệm tới gần hết hạn."""

    def __init__(self):
        self.token, self.het_han, self.lock = None, 0.0, threading.Lock()

    def lay(self):
        with self.lock:
            if self.token and time.time() < self.het_han - 30:
                return self.token
            bi_mat = _bi_mat(f"tang2/{TANG2}/keycloak/{CLIENT}").get("secret")
            form = urllib.parse.urlencode({"grant_type": "client_credentials", "client_id": CLIENT,
                                           "client_secret": bi_mat or ""}).encode()
            status, data = goi("POST", TOKEN_URL, form=form)
            if status != 200 or not data:
                raise LoiKhoTriThuc(f"không lấy được token dịch vụ {CLIENT} (HTTP {status})")
            self.token, self.het_han = data["access_token"], time.time() + int(data.get("expires_in", 60))
            return self.token

    def bo(self):
        with self.lock:
            self.token = None


TOKEN = TokenDichVu()


def pgrst(method, path, body=None, prefer=None):
    """PostgREST bằng token dịch vụ → JSON. Lỗi → LoiKhoTriThuc (status = mã HTTP)."""
    h = {"Authorization": f"Bearer {TOKEN.lay()}", "Accept": "application/json"}
    if prefer:
        h["Prefer"] = prefer
    status, data = goi(method, POSTGREST_URL + path, body, h, timeout=30)
    if status == 401:
        TOKEN.bo()
    if status >= 400:
        msg = data.get("message") if isinstance(data, dict) else None
        raise LoiKhoTriThuc(f"PostgREST {method} {path.split('?')[0]} → {status} {msg or ''}".rstrip(), status)
    return data


def tim_ngu_nghia(vec_chu, nhan_mo_hinh, so_luong=8, ma_thu_tuc=None):
    """RPC tim_doan_gan: đoạn gần câu hỏi nhất theo cosin (chỉ vector cùng mô hình nhúng)."""
    return pgrst("POST", "/rpc/tim_doan_gan", {"p_vec": vec_chu, "p_mo_hinh": nhan_mo_hinh, "p_so_luong": so_luong,
                                               "p_ma_thu_tuc": ma_thu_tuc})


class Meili:
    """Một index `<tiền tố><ten_index>` trên Meilisearch (mặc định index tri thức), bằng khóa API riêng của Tầng 2.
    Wiki văn bản cho cán bộ (#95) dùng lại lớp này với index `wiki-van-ban`."""

    def __init__(self, ten_index=TEN_INDEX):
        self._cfg, self.lock, self.ten_index = None, threading.Lock(), ten_index

    def cfg(self):
        with self.lock:
            if self._cfg is None:
                c = _bi_mat(f"tang2/{TANG2}/meilisearch")
                self._cfg = {"url": c["url"].rstrip("/"), "h": {"Authorization": f"Bearer {c['key']}"},
                             "index": f"{c['tien_to_index']}{self.ten_index}"}
            return self._cfg

    def goi(self, method, duong, body=None, cho_phep=(), timeout=15):
        c = self.cfg()
        status, data = goi(method, c["url"] + duong.replace("{index}", c["index"]), body, c["h"], timeout=timeout)
        if status in (401, 403):
            with self.lock:
                self._cfg = None  # khóa vừa được cấp lại: lần sau đọc OpenBao
        if status >= 400 and status not in cho_phep:
            code = data.get("code") if isinstance(data, dict) else None
            raise LoiKhoTriThuc(f"Meilisearch {method} {duong.split('?')[0]} → {status} {code or ''}".rstrip(), status)
        return status, data

    def tim(self, q, so_luong=8, ma_thu_tuc=None):
        body = {"q": q, "limit": so_luong, "attributesToRetrieve": COT_DOAN.split(","),
                "showRankingScore": True}
        if ma_thu_tuc:
            body["filter"] = f"ma_thu_tuc = {json.dumps(ma_thu_tuc)}"
        _, data = self.goi("POST", "/indexes/{index}/search", body, timeout=10)
        return (data or {}).get("hits") or []

    def cho_tac_vu(self, task_uid, toi_da_giay=120):
        """Chờ tác vụ bất đồng bộ của Meilisearch xong. Thất bại → LoiKhoTriThuc."""
        han = time.time() + toi_da_giay
        while time.time() < han:
            _, t = self.goi("GET", f"/tasks/{task_uid}")
            if t["status"] == "succeeded":
                return t
            if t["status"] in ("failed", "canceled"):
                raise LoiKhoTriThuc(f"tác vụ Meilisearch {task_uid} {t['status']}: {(t.get('error') or {}).get('code')}")
            time.sleep(0.3)
        raise LoiKhoTriThuc(f"tác vụ Meilisearch {task_uid} chưa xong sau {toi_da_giay} giây")


MEILI = Meili()
