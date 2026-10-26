#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Dịch vụ đọc chữ trên ảnh giấy tờ (OCR) của nền tảng (#93), profile `ai`. Không biết loại giấy tờ hay
nghiệp vụ nào: nhận ảnh, trả các dòng chữ kèm độ tin cậy và khung; dịch vụ Tầng 2 tự trích trường.

Hai mô hình nguồn mở, ghép theo cách làm phổ biến cho tiếng Việt:
  - PaddleOCR (Apache-2.0) mô hình PP-OCRv5_mobile_det: tìm vị trí các dòng chữ;
  - VietOCR (Apache-2.0) mô hình vgg_transformer: đọc từng dòng, giữ đúng dấu tiếng Việt (bộ nhận dạng
    đa ngôn ngữ của PaddleOCR làm rơi dấu: "Nguyễn Thị" → "Nguyn Th").

Trọng số KHÔNG nằm trong repo hay image: lần đầu khởi động tải vào volume /models (PaddleX tự tải mô hình
phát hiện; tệp cấu hình và trọng số VietOCR tải từ nơi tác giả công bố, kiểm SHA-256 ghim sẵn bên dưới),
các lần sau dùng lại. Chưa nạp xong mô hình thì /healthz trả 503.

  GET  /healthz   200 khi mô hình đã sẵn sàng
  POST /doc       body = ảnh PNG hoặc JPEG (≤ OCR_TOI_DA_BYTE) → {"dong": [{"chu", "tin_cay", "khung": [x0,y0,x1,y1]}],
                  "mo_hinh": {...}, "kich_thuoc": [rộng, cao], "thoi_gian_giay"}; dòng xếp từ trên xuống, trái sang phải

Không mở cổng ra host, không qua APISIX: chỉ dịch vụ trong mạng nội bộ gọi. Không lưu ảnh, không ghi chữ đọc
được ra log (giấy tờ có dữ liệu cá nhân). Mỗi lúc đọc một ảnh (CPU), request sau chờ.
"""

import hashlib
import io
import json
import logging
import os
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("PORT", "8000"))
THU_MUC = os.environ.get("OCR_THU_MUC_MO_HINH", "/models")
TOI_DA_BYTE = int(os.environ.get("OCR_TOI_DA_BYTE", str(10 * 1024 * 1024)))
CANH_TOI_DA = int(os.environ.get("OCR_CANH_TOI_DA", "2000"))
MO_HINH_PHAT_HIEN = os.environ.get("OCR_MO_HINH_PHAT_HIEN", "PP-OCRv5_mobile_det")
NGUON_VIETOCR = os.environ.get("OCR_NGUON_VIETOCR", "https://vocr.vn/data/vietocr").rstrip("/")
# Tệp của VietOCR bản vgg_transformer (https://github.com/pbcquoc/vietocr) → SHA-256 đã kiểm ngày 26/10/2026.
TEP_VIETOCR = {
    "base.yml": "9c8283fadb950f06f5d3400475f80d5355700ff315c9c48b7875e6ea66647d1c",
    "vgg-transformer.yml": "0df9feee197754c7381871e5dfd07c6f3e292a4853eece6f1af240923e57c907",
    "vgg_transformer.pth": "380512193a8b6cbf6fad80deacdc9b6939d10d473d199892fc6408d13775ea59",
}

log = logging.getLogger("ocr")
TRANG_THAI = {"san_sang": False, "loi": None}
KHOA = threading.Lock()
MAY = {}


def _sha256(duong):
    h = hashlib.sha256()
    with open(duong, "rb") as f:
        for khoi in iter(lambda: f.read(1 << 20), b""):
            h.update(khoi)
    return h.hexdigest()


def tai_vietocr():
    """Tải cấu hình + trọng số VietOCR vào THU_MUC/vietocr nếu chưa có; sai SHA-256 → xóa, báo lỗi."""
    thu_muc = os.path.join(THU_MUC, "vietocr")
    os.makedirs(thu_muc, exist_ok=True)
    for ten, sha in TEP_VIETOCR.items():
        duong = os.path.join(thu_muc, ten)
        if os.path.exists(duong) and _sha256(duong) == sha:
            continue
        url = f"{NGUON_VIETOCR}/{'config/' if ten.endswith('.yml') else ''}{ten}"
        log.info("tải %s", url)
        tam = duong + ".tai"
        with urllib.request.urlopen(url, timeout=600) as r, open(tam, "wb") as f:
            while khoi := r.read(1 << 20):
                f.write(khoi)
        if _sha256(tam) != sha:
            os.remove(tam)
            raise RuntimeError(f"{ten}: SHA-256 không khớp bản đã kiểm, không dùng")
        os.replace(tam, duong)
    return thu_muc


def nap_mo_hinh():
    import yaml
    from paddleocr import TextDetection
    from vietocr.tool.config import Cfg
    from vietocr.tool.predictor import Predictor

    thu_muc = tai_vietocr()
    cfg = {}
    for ten in ("base.yml", "vgg-transformer.yml"):
        with open(os.path.join(thu_muc, ten), encoding="utf-8") as f:
            cfg.update(yaml.safe_load(f))
    cfg = Cfg(cfg)
    cfg["device"] = "cpu"
    cfg["cnn"]["pretrained"] = False  # không tải trọng số ImageNet: nạp trọng số VietOCR ngay sau
    cfg["weights"] = os.path.join(thu_muc, "vgg_transformer.pth")
    MAY["nhan_dang"] = Predictor(cfg)
    MAY["phat_hien"] = TextDetection(model_name=MO_HINH_PHAT_HIEN)
    MAY["ten"] = {"phat_hien": f"PaddleOCR {MO_HINH_PHAT_HIEN}", "nhan_dang": "VietOCR vgg_transformer"}


def nap_nen():
    for lan in range(1, 6):
        try:
            nap_mo_hinh()
            TRANG_THAI.update(san_sang=True, loi=None)
            log.info("mô hình sẵn sàng: %s", MAY["ten"])
            return
        except Exception as e:  # noqa: BLE001 – mạng chập chờn khi tải lần đầu: thử lại
            TRANG_THAI["loi"] = str(e)[:300]
            log.error("nạp mô hình lỗi (lần %d): %s", lan, e)
            time.sleep(10 * lan)


def _hang(dong):
    """Xếp khung theo hàng (chồng nhau quá nửa chiều cao thì cùng hàng), trong hàng từ trái sang phải."""
    dong = sorted(dong, key=lambda d: (d["khung"][1] + d["khung"][3]) / 2)
    hang = []
    for d in dong:
        y0, y1 = d["khung"][1], d["khung"][3]
        if hang:
            cuoi = hang[-1][-1]["khung"]
            chong = min(y1, cuoi[3]) - max(y0, cuoi[1])
            if chong > 0.5 * min(y1 - y0, cuoi[3] - cuoi[1]):
                hang[-1].append(d)
                continue
        hang.append([d])
    return [d for h in hang for d in sorted(h, key=lambda d: d["khung"][0])]


def doc(du_lieu):
    from PIL import Image, ImageOps

    anh = ImageOps.exif_transpose(Image.open(io.BytesIO(du_lieu))).convert("RGB")
    if max(anh.size) > CANH_TOI_DA:
        anh.thumbnail((CANH_TOI_DA, CANH_TOI_DA))
    import numpy as np

    kq = list(MAY["phat_hien"].predict(np.asarray(anh)[:, :, ::-1]))  # PaddleX nhận BGR như OpenCV
    dong = []
    for p in (kq[0]["dt_polys"] if kq else []):
        xs, ys = [float(q[0]) for q in p], [float(q[1]) for q in p]
        khung = [max(min(xs) - 4, 0), max(min(ys) - 4, 0), min(max(xs) + 4, anh.width), min(max(ys) + 4, anh.height)]
        if khung[2] - khung[0] < 4 or khung[3] - khung[1] < 4:
            continue
        chu, tin_cay = MAY["nhan_dang"].predict(anh.crop(tuple(int(v) for v in khung)), return_prob=True)
        if chu.strip():
            dong.append({"chu": chu.strip(), "tin_cay": round(float(tin_cay), 3), "khung": [round(v) for v in khung]})
    return {"dong": _hang(dong), "mo_hinh": MAY["ten"], "kich_thuoc": list(anh.size)}


class Handler(BaseHTTPRequestHandler):
    server_version = "dxos-ocr"
    sys_version = ""

    def _tra(self, status, data):
        raw = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path != "/healthz":
            return self._tra(404, {"loi": "Không có endpoint này"})
        if TRANG_THAI["san_sang"]:
            return self._tra(200, {"ok": True, "mo_hinh": MAY["ten"]})
        return self._tra(503, {"ok": False, "loi": TRANG_THAI["loi"] or "đang nạp mô hình"})

    def do_POST(self):
        if self.path != "/doc":
            return self._tra(404, {"loi": "Không có endpoint này"})
        if not TRANG_THAI["san_sang"]:
            return self._tra(503, {"loi": "Mô hình OCR chưa sẵn sàng"})
        n = int(self.headers.get("Content-Length") or 0)
        if not 0 < n <= TOI_DA_BYTE:
            return self._tra(413 if n else 400, {"loi": "Ảnh rỗng hoặc quá lớn"})
        du_lieu = self.rfile.read(n)
        if not (du_lieu.startswith(b"\x89PNG\r\n\x1a\n") or du_lieu.startswith(b"\xff\xd8\xff")):
            return self._tra(415, {"loi": "Chỉ nhận ảnh PNG hoặc JPEG"})
        bat_dau = time.monotonic()
        try:
            with KHOA:
                kq = doc(du_lieu)
        except Exception:  # noqa: BLE001 – ảnh hỏng: không lộ chi tiết
            log.exception("đọc ảnh lỗi")
            return self._tra(422, {"loi": "Không đọc được ảnh"})
        kq["thoi_gian_giay"] = round(time.monotonic() - bat_dau, 2)
        log.info("đọc ảnh %d byte: %d dòng, %.2f giây", n, len(kq["dong"]), kq["thoi_gian_giay"])
        self._tra(200, kq)

    def log_message(self, fmt, *args):
        pass  # đã ghi log ở trên, không ghi gì khác


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    threading.Thread(target=nap_nen, name="nap-mo-hinh", daemon=True).start()
    log.info("dịch vụ OCR nghe cổng %d, mô hình ở %s", PORT, THU_MUC)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
