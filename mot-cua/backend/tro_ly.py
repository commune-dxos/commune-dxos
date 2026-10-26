#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Trợ lý thủ tục hành chính (RAG, #91): dịch vụ tro-ly của Tầng 2, sau APISIX /tro-ly/* (công khai, giới hạn
tần suất chặt). Người dân hỏi trên cổng công dân không cần đăng nhập; câu hỏi không được lưu.

  GET  /healthz             kiểm sống (Docker)
  GET  /tro-ly/thong-tin    chế độ đang chạy: có mô hình ngôn ngữ không, tên mô hình (để web ghi rõ)
  GET  /tro-ly/tim?q=…[&ma=…]   chỉ tìm từ khóa (Meilisearch), không gọi mô hình
  POST /tro-ly/hoi          {"cau_hoi": "…", "ma_thu_tuc"?: "KS01"} → câu trả lời có dẫn nguồn

Luồng hỏi: tìm lai = từ khóa (Meilisearch) + ngữ nghĩa (vector của câu hỏi, RPC tim_doan_gan trên pgvector),
gộp bằng Reciprocal Rank Fusion lấy 4 đoạn → lời nhắc chỉ cho trả lời từ các NGUỒN đánh số → kiểm trích dẫn:
bỏ [n] không có thật; không còn trích dẫn nào thì thay bằng câu trích nguyên văn nguồn [1] (luôn dẫn nguồn).
Suy giảm êm (LLM_PROVIDER=tat, mô hình lỗi hay quá giờ, chưa nhúng xong): vẫn trả các đoạn tìm được, kèm
thông báo; Meilisearch lỗi thì dùng riêng pgvector và ngược lại; cả hai lỗi → 503.

Nhà cung cấp mô hình: mo_hinh.py (LLM_PROVIDER). Gọi kho tri thức: tri_thuc.py. Phần thuần: rag.py.
Mỗi lúc chỉ TRO_LY_DONG_THOI câu hỏi được sinh trả lời (mô hình chạy CPU); quá thì 503 "đang bận".
"""

import json
import logging
import os
import re
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import bimat
import mo_hinh
import rag
import tri_thuc

PORT = int(os.environ.get("PORT", "8000"))
DONG_THOI = int(os.environ.get("TRO_LY_DONG_THOI", "2"))
TOI_DA_BODY = 4096
SO_TIM = 8
SO_NGUON = 4
_MA = re.compile(r"[A-Za-z0-9]{2,20}")

log = logging.getLogger("tro-ly")


class Loi(Exception):
    def __init__(self, status, thong_diep):
        super().__init__(thong_diep)
        self.status, self.thong_diep = status, thong_diep


def _khoa_api():
    """Khóa API của openai-compatible (tùy chọn) trong OpenBao dxos/tang2/<DXOS_TANG2>/llm."""
    try:
        return bimat.doc(f"tang2/{tri_thuc.TANG2}/llm").get("api_key")
    except bimat.LoiBiMat:
        return None


class TroLy:
    def __init__(self, mh, kho=tri_thuc, meili=None, dong_thoi=DONG_THOI):
        self.mh, self.kho, self.meili = mh, kho, meili or tri_thuc.MEILI
        self.cho = threading.BoundedSemaphore(dong_thoi)
        # Ngưỡng tương đồng cosin để nhận một đoạn chỉ khớp ngữ nghĩa (không khớp từ khóa): vector băm từ của
        # chế độ gia-lap có cosin thấp hơn nhiều so với bge-m3.
        self.nguong = float(os.environ.get("TRO_LY_NGUONG") or (0.05 if mh.che_do == "gia-lap" else 0.45))

    def thong_tin(self):
        return {"che_do": self.mh.che_do, "co_mo_hinh_ngon_ngu": self.mh.co_sinh,
                "mo_hinh": self.mh.ten_sinh, "mo_hinh_nhung": self.mh.nhan_nhung}

    @staticmethod
    def _gon(x, so=None, duoc_trich=None):
        kq = {"id": x["id"], "ma_thu_tuc": x.get("ma_thu_tuc"), "tieu_de": x["tieu_de"],
              "trich": rag._trich(x["noi_dung"], 300), "lien_ket": x.get("lien_ket")}
        if so is not None:
            kq.update(so=so, duoc_trich=duoc_trich)
        return kq

    def tim(self, q, ma=None, cach=None):
        """→ (đoạn tìm lai đã gộp, cách tìm chạy được). Cả hai cách lỗi → Loi 503."""
        cach = {} if cach is None else cach
        tu_khoa, ngu_nghia = [], []
        try:
            tu_khoa = self.meili.tim(q, SO_TIM, ma)
            cach["tu_khoa"] = True
        except tri_thuc.LoiKhoTriThuc as e:
            log.warning("tìm từ khóa lỗi: %s", e)
            cach["tu_khoa"] = False
        if self.mh.nhan_nhung:
            try:
                vec = rag.vector_chu(self.mh.nhung([q])[0])
                ngu_nghia = [r for r in self.kho.tim_ngu_nghia(vec, self.mh.nhan_nhung, SO_TIM, ma)
                             if r.get("tuong_dong", 0) >= self.nguong]
                cach["ngu_nghia"] = True
            except (mo_hinh.LoiMoHinh, tri_thuc.LoiKhoTriThuc) as e:
                log.warning("tìm ngữ nghĩa lỗi: %s", e)
                cach["ngu_nghia"] = False
        if not any(cach.values()):
            raise Loi(503, "Trợ lý tạm thời không tra cứu được tài liệu. Vui lòng thử lại sau.")
        return rag.gop_rrf(tu_khoa, ngu_nghia, so_luong=SO_NGUON), cach

    def chi_tim(self, q, ma=None):
        try:
            q = rag.chuan_hoa_cau_hoi(q)
        except ValueError as e:
            raise Loi(400, str(e)) from None
        try:
            ket_qua = self.meili.tim(q, SO_TIM, ma)
        except tri_thuc.LoiKhoTriThuc as e:
            log.warning("tìm từ khóa lỗi: %s", e)
            raise Loi(503, "Tìm kiếm tạm thời không hoạt động. Vui lòng thử lại sau.") from None
        return {"ket_qua": [self._gon(x) for x in ket_qua]}

    def hoi(self, body):
        try:
            q = rag.chuan_hoa_cau_hoi(body.get("cau_hoi"))
        except ValueError as e:
            raise Loi(400, str(e)) from None
        ma = body.get("ma_thu_tuc") or None
        if ma is not None and (not isinstance(ma, str) or not _MA.fullmatch(ma)):
            raise Loi(400, "Mã thủ tục không hợp lệ")
        bat_dau = time.monotonic()
        nguon, cach = self.tim(q, ma)
        kq = {**self.thong_tin(), "tim_kiem": cach, "cau_tra_loi": None, "thong_bao": None,
              "trich_tu_dong": False}
        if not nguon:
            kq.update(cau_tra_loi=rag.KHONG_CO_THONG_TIN, nguon=[])
            return kq
        trich = []
        if not self.mh.co_sinh:
            kq["thong_bao"] = ("Trợ lý đang ở chế độ chỉ tìm kiếm (chưa bật mô hình ngôn ngữ). "
                               "Dưới đây là các đoạn tài liệu liên quan nhất.")
        elif not self.cho.acquire(timeout=20):
            kq["thong_bao"] = "Trợ lý đang bận trả lời người khác. Dưới đây là các đoạn tài liệu liên quan nhất."
        else:
            try:
                tra_loi = self.mh.sinh(rag.loi_nhac(q, nguon))
                tra_loi, trich = rag.kiem_trich_dan(tra_loi, len(nguon))
                if rag.la_khong_co_thong_tin(tra_loi):
                    tra_loi, trich = rag.KHONG_CO_THONG_TIN, []
                elif not trich:
                    # Mô hình không dẫn nguồn: không dùng câu của mô hình, trích nguyên văn nguồn [1].
                    tra_loi, trich = rag.tra_loi_trich(q, nguon), [1]
                    kq["trich_tu_dong"] = True
                kq["cau_tra_loi"] = tra_loi
            except mo_hinh.LoiMoHinh as e:
                log.warning("mô hình ngôn ngữ lỗi: %s", e)
                kq["thong_bao"] = ("Mô hình ngôn ngữ tạm thời không phản hồi. "
                                   "Dưới đây là các đoạn tài liệu liên quan nhất.")
            finally:
                self.cho.release()
        kq["nguon"] = [self._gon(x, i, i in trich) for i, x in enumerate(nguon, start=1)]
        log.info("hỏi: %d ký tự, %d nguồn, trích %s, %.1f giây", len(q), len(nguon), trich, time.monotonic() - bat_dau)
        return kq


class Handler(BaseHTTPRequestHandler):
    server_version = "dxos-tro-ly"
    sys_version = ""
    tro_ly = None

    def _tra(self, status, data):
        raw = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def _xu_ly(self, method):
        u = urllib.parse.urlsplit(self.path)
        path = u.path.rstrip("/") or "/"
        query = dict(urllib.parse.parse_qsl(u.query))
        try:
            if method == "GET" and path == "/healthz":
                return self._tra(200, {"ok": True})
            if method == "GET" and path == "/tro-ly/thong-tin":
                return self._tra(200, self.tro_ly.thong_tin())
            if method == "GET" and path == "/tro-ly/tim":
                ma = query.get("ma") or None
                if ma is not None and not _MA.fullmatch(ma):
                    raise Loi(400, "Mã thủ tục không hợp lệ")
                return self._tra(200, self.tro_ly.chi_tim(query.get("q", ""), ma))
            if method == "POST" and path == "/tro-ly/hoi":
                n = int(self.headers.get("Content-Length") or 0)
                if n > TOI_DA_BODY:
                    raise Loi(413, "Câu hỏi quá dài")
                try:
                    body = json.loads(self.rfile.read(n) or b"{}")
                except ValueError:
                    raise Loi(400, "Body không phải JSON") from None
                if not isinstance(body, dict):
                    raise Loi(400, "Body phải là object JSON")
                return self._tra(200, self.tro_ly.hoi(body))
            if path in ("/tro-ly/thong-tin", "/tro-ly/tim", "/tro-ly/hoi"):
                raise Loi(405, "Phương thức không hỗ trợ")
            raise Loi(404, "Không có endpoint này")
        except Loi as e:
            self._tra(e.status, {"loi": e.thong_diep})
        except Exception:  # noqa: BLE001 – không để lộ chi tiết lỗi nội bộ ra client
            log.exception("lỗi không lường trước")
            self._tra(500, {"loi": "Lỗi nội bộ"})

    def do_GET(self):
        self._xu_ly("GET")

    def do_POST(self):
        self._xu_ly("POST")

    def log_message(self, fmt, *args):  # không ghi query string (câu hỏi của người dân)
        log.info("%s %s %s", self.command, urllib.parse.urlsplit(self.path).path, args[1] if len(args) > 1 else "")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    Handler.tro_ly = TroLy(mo_hinh.tu_moi_truong(lay_khoa=_khoa_api))
    log.info("trợ lý thủ tục nghe cổng %d, %s", PORT, Handler.tro_ly.thong_tin())
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
