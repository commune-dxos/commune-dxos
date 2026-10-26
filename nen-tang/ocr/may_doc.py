#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Dịch vụ đọc chữ trên ảnh giấy tờ (OCR) của nền tảng (#93), profile `ai`. Không biết loại giấy tờ hay
nghiệp vụ nào: nhận ảnh, trả các dòng chữ kèm độ tin cậy và khung; dịch vụ Tầng 2 tự trích trường.

Hai mô hình nguồn mở, ghép theo cách làm phổ biến cho tiếng Việt, cùng chạy bằng ONNX Runtime (MIT):
  - PP-OCRv5_mobile_det của PaddleOCR (Apache-2.0), bản ONNX của RapidOCR: tìm vị trí các dòng chữ;
  - VietOCR vgg_transformer (Apache-2.0), xuất ONNX lúc build (encoder + decoder): đọc từng dòng, giữ đúng dấu
    tiếng Việt (bộ nhận dạng đa ngôn ngữ của PaddleOCR làm rơi dấu: "Nguyễn Thị" → "Nguyn Th").
Tiền xử lý và hậu xử lý viết lại bằng numpy + OpenCV theo đúng tham số của mô hình gốc: DBPostProcess của PaddleX
(cấu hình inference.yml của PP-OCRv5_mobile_det) và hàm translate() giải mã tham lam của VietOCR.

Tệp mô hình nằm sẵn trong image (stage build `xuat-mo-hinh`, kiểm SHA-256), không tải gì lúc chạy, không cần mạng
(compose đặt dịch vụ trong mạng `ocr-noi-bo` không ra Internet). Lúc khởi động kiểm lại SHA-256 các tệp theo
mo-hinh.json; sai thì /healthz trả 503. Kết quả trùng khớp bản chạy PaddleX + PyTorch (cùng khung, cùng chữ, cùng
độ tin cậy trên hai ảnh mẫu giả, đo 26/10/2026).

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
import math
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("PORT", "8000"))
THU_MUC = os.environ.get("OCR_THU_MUC_MO_HINH", "/nen-tang/ocr/mo-hinh")
TOI_DA_BYTE = int(os.environ.get("OCR_TOI_DA_BYTE", str(10 * 1024 * 1024)))
CANH_TOI_DA = int(os.environ.get("OCR_CANH_TOI_DA", "2000"))
LUONG = int(os.environ.get("OMP_NUM_THREADS", "4"))

# Tham số của PP-OCRv5_mobile_det (inference.yml của PaddlePaddle/PP-OCRv5_mobile_det): DetResizeForTest
# resize_long 960 kiểu "max", NormalizeImage ImageNet trên ảnh BGR, DBPostProcess.
CANH_PHAT_HIEN = 960
TRUNG_BINH = (0.485, 0.456, 0.406)
DO_LECH = (0.229, 0.224, 0.225)
NGUONG, NGUONG_KHUNG, TI_LE_NO, TOI_DA_KHUNG, CANH_NHO_NHAT = 0.3, 0.6, 1.5, 1000, 3

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


def nap_mo_hinh():
    import onnxruntime as ort

    # ONNX Runtime bản Linux có gửi số liệu sử dụng (1DS) về Microsoft: tắt bằng biến ORT_DISABLE_TELEMETRY=1 đặt sẵn
    # trong image (có hiệu lực ngay lúc import) và tắt thêm ở đây. Dịch vụ còn nằm trong mạng nội bộ không ra Internet.
    ort.disable_telemetry_events()

    with open(os.path.join(THU_MUC, "mo-hinh.json"), encoding="utf-8") as f:
        ghi = json.load(f)
    for ten, sha in ghi["sha256"].items():
        if _sha256(os.path.join(THU_MUC, ten)) != sha:
            raise RuntimeError(f"{ten}: SHA-256 không khớp lúc build, không dùng")
    with open(os.path.join(THU_MUC, "vietocr.json"), encoding="utf-8") as f:
        MAY["vietocr"] = json.load(f)
    tuy_chon = ort.SessionOptions()
    tuy_chon.intra_op_num_threads = LUONG
    tuy_chon.inter_op_num_threads = 1

    def phien(ten):
        return ort.InferenceSession(os.path.join(THU_MUC, ten), tuy_chon, providers=["CPUExecutionProvider"])

    MAY["phat_hien"] = phien(ghi["phat_hien"]["tep"])
    MAY["ma_hoa"] = phien("vietocr_encoder.onnx")
    MAY["giai_ma"] = phien("vietocr_decoder.onnx")
    MAY["ky_tu"] = {i + 4: c for i, c in enumerate(MAY["vietocr"]["vocab"])}
    MAY["ten"] = {"phat_hien": f"PaddleOCR {ghi['phat_hien']['ten']}", "nhan_dang": "VietOCR vgg_transformer",
                  "chay": f"ONNX Runtime {ort.__version__}"}


def nap_nen():
    try:
        nap_mo_hinh()
        TRANG_THAI.update(san_sang=True, loi=None)
        log.info("mô hình sẵn sàng: %s", MAY["ten"])
    except Exception as e:  # noqa: BLE001 – tệp mô hình hỏng: báo qua /healthz
        TRANG_THAI["loi"] = str(e)[:300]
        log.error("nạp mô hình lỗi: %s", e)


# --- Phát hiện dòng chữ (DB) -------------------------------------------------------------------------------------

def _co_anh_phat_hien(h, w):
    """DetResizeForTest kiểu "max" của PaddleX: cạnh dài ≤ 960, rồi làm tròn hai cạnh về bội số của 32."""
    ti_le = CANH_PHAT_HIEN / max(h, w) if max(h, w) > CANH_PHAT_HIEN else 1.0
    return max(int(round(int(h * ti_le) / 32) * 32), 32), max(int(round(int(w * ti_le) / 32) * 32), 32)


def _khung_nho_nhat(diem):
    """get_mini_boxes của PaddleX: hình chữ nhật xoay nhỏ nhất, 4 đỉnh theo thứ tự trên-trái, trên-phải,
    dưới-phải, dưới-trái; kèm cạnh ngắn."""
    import cv2

    hcn = cv2.minAreaRect(diem)
    p = sorted(list(cv2.boxPoints(hcn)), key=lambda x: x[0])
    a, d = (p[0], p[1]) if p[1][1] > p[0][1] else (p[1], p[0])
    b, c = (p[2], p[3]) if p[3][1] > p[2][1] else (p[3], p[2])
    return hcn, [a, b, c, d], min(hcn[1])


def _diem_khung(ban_do, khung):
    """box_score_fast: trung bình xác suất trong đa giác."""
    import cv2
    import numpy as np

    h, w = ban_do.shape
    khung = khung.copy()
    x0 = max(0, min(math.floor(khung[:, 0].min()), w - 1))
    x1 = max(0, min(math.ceil(khung[:, 0].max()), w - 1))
    y0 = max(0, min(math.floor(khung[:, 1].min()), h - 1))
    y1 = max(0, min(math.ceil(khung[:, 1].max()), h - 1))
    mat_na = np.zeros((y1 - y0 + 1, x1 - x0 + 1), dtype=np.uint8)
    khung[:, 0] -= x0
    khung[:, 1] -= y0
    cv2.fillPoly(mat_na, khung.reshape(1, -1, 2).astype(np.int32), 1)
    return cv2.mean(ban_do[y0:y1 + 1, x0:x1 + 1], mat_na)[0]


def _tron(v):
    """Round() của Clipper: làm tròn nửa ra xa số 0."""
    return int(v - 0.5) if v < 0 else int(v + 0.5)


def _no_khung(diem):
    """Bước nới khung (unclip) của PaddleX: nới tứ giác ra khoảng cách d = diện tích × 1,5 / chu vi, nối góc tròn,
    bằng ClipperOffset của pyclipper. Hàm này làm lại đúng thuật toán đó (Clipper 6.4.2, ClipperOffset::OffsetPoint +
    DoRound, ArcTolerance 0,25 mặc định của pyclipper) cho một đa giác lồi, để image không cần thêm pyclipper: toạ độ
    vào cắt phần lẻ như pyclipper đổi float → số nguyên, đảo chiều đa giác nếu diện tích âm, mỗi góc sinh các điểm
    trên cung tròn, điểm ra làm tròn kiểu Clipper. Trả các điểm của đa giác đã nới (chỉ dùng để lấy hình chữ nhật
    nhỏ nhất, nên bỏ qua bước hợp nhất cuối của Clipper: bước đó không đổi bao lồi)."""
    import cv2
    import numpy as np

    d = cv2.contourArea(diem.astype(np.float32)) * TI_LE_NO / cv2.arcLength(diem.astype(np.float32), True)
    p = [(int(x), int(y)) for x, y in diem.tolist()]
    p = [q for i, q in enumerate(p) if q != p[i - 1]] or p[:1]
    n = len(p)
    if n < 3 or d <= 0:
        return np.array(p, dtype=np.float32)
    dien_tich = -0.5 * sum((p[i - 1][0] + p[i][0]) * (p[i - 1][1] - p[i][1]) for i in range(n))
    if dien_tich < 0:
        p = p[::-1]
    phap = []
    for i in range(n):
        dx, dy = p[(i + 1) % n][0] - p[i][0], p[(i + 1) % n][1] - p[i][1]
        do_dai = math.hypot(dx, dy) or 1.0
        phap.append((dy / do_dai, -dx / do_dai))
    sai_so = 0.25 if 0.25 <= d * 0.25 else d * 0.25
    buoc = math.pi / math.acos(1 - sai_so / d)
    buoc = min(buoc, d * math.pi)
    sin_b, cos_b, buoc_moi_rad = math.sin(2 * math.pi / buoc), math.cos(2 * math.pi / buoc), buoc / (2 * math.pi)
    ra = []
    for j in range(n):
        k = j - 1 if j else n - 1
        sin_a = phap[k][0] * phap[j][1] - phap[j][0] * phap[k][1]
        cos_a = phap[k][0] * phap[j][0] + phap[k][1] * phap[j][1]
        if abs(sin_a * d) < 1.0 and cos_a > 0:
            ra.append((_tron(p[j][0] + phap[k][0] * d), _tron(p[j][1] + phap[k][1] * d)))
            continue
        sin_a = max(-1.0, min(1.0, sin_a))
        if sin_a * d < 0:  # góc lõm (không xảy ra với hình chữ nhật, giữ cho đúng thuật toán)
            ra += [(_tron(p[j][0] + phap[k][0] * d), _tron(p[j][1] + phap[k][1] * d)), p[j],
                   (_tron(p[j][0] + phap[j][0] * d), _tron(p[j][1] + phap[j][1] * d))]
            continue
        x, y = phap[k]
        for _ in range(max(_tron(buoc_moi_rad * abs(math.atan2(sin_a, cos_a))), 1)):
            ra.append((_tron(p[j][0] + x * d), _tron(p[j][1] + y * d)))
            x, y = x * cos_b - sin_b * y, x * sin_b + y * cos_b
        ra.append((_tron(p[j][0] + phap[j][0] * d), _tron(p[j][1] + phap[j][1] * d)))
    return np.array(ra, dtype=np.float32)


def phat_hien(bgr):
    """Trả danh sách khung 4 đỉnh (toạ độ ảnh gốc). Hậu xử lý = DBPostProcess (box_type quad, score_mode fast) của
    PaddleX, tham số theo inference.yml của mô hình."""
    import cv2
    import numpy as np

    h, w = bgr.shape[:2]
    rh, rw = _co_anh_phat_hien(h, w)
    x = cv2.resize(bgr, (rw, rh)).astype(np.float32) / 255.0
    x = (x - np.array(TRUNG_BINH, dtype=np.float32)) / np.array(DO_LECH, dtype=np.float32)
    x = x.transpose(2, 0, 1)[None]
    ban_do = MAY["phat_hien"].run(None, {MAY["phat_hien"].get_inputs()[0].name: x})[0][0, 0]
    nhi_phan = (ban_do > NGUONG).astype(np.uint8) * 255
    duong_vien, _ = cv2.findContours(nhi_phan, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    sx, sy = w / ban_do.shape[1], h / ban_do.shape[0]
    ket_qua = []
    for dv in duong_vien[:TOI_DA_KHUNG]:
        _, diem, canh = _khung_nho_nhat(dv)
        if canh < CANH_NHO_NHAT:
            continue
        diem = np.array(diem)
        if _diem_khung(ban_do, diem.reshape(-1, 2)) < NGUONG_KHUNG:
            continue
        _, diem, canh = _khung_nho_nhat(_no_khung(diem))
        if canh < CANH_NHO_NHAT + 2:
            continue
        diem = np.array(diem)
        diem[:, 0] = np.clip(np.round(diem[:, 0] * sx), 0, w)
        diem[:, 1] = np.clip(np.round(diem[:, 1] * sy), 0, h)
        ket_qua.append(diem)
    return ket_qua


# --- Nhận dạng một dòng (VietOCR, giải mã tham lam) ---------------------------------------------------------------

def nhan_dang(anh_dong):
    """= Predictor.predict(return_prob=True) của VietOCR: ảnh cao 32, rộng giữ tỉ lệ làm tròn lên bội 10 trong
    [min, max], LANCZOS, chia 255; giải mã tham lam tới <eos>; độ tin cậy = trung bình xác suất các ký tự."""
    import numpy as np
    from PIL import Image

    cfg = MAY["vietocr"]
    w, h = anh_dong.size
    moi_w = math.ceil(int(cfg["image_height"] * float(w) / float(h)) / 10) * 10
    moi_w = min(max(moi_w, cfg["image_min_width"]), cfg["image_max_width"])
    x = np.asarray(anh_dong.convert("RGB").resize((moi_w, cfg["image_height"]), Image.LANCZOS), dtype=np.float32)
    x = (x.transpose(2, 0, 1) / 255.0)[None].astype(np.float32)
    memory = MAY["ma_hoa"].run(None, {"anh": x})[0]
    ids, xs = [cfg["sos"]], []
    while len(ids) <= cfg["max_seq_length"] + 1 and ids[-1] != cfg["eos"]:
        p = MAY["giai_ma"].run(None, {"tgt": np.array(ids, dtype=np.int64)[:, None], "memory": memory})[0][0]
        ids.append(int(p.argmax()))
        xs.append(float(p.max()))
    cuoi = ids.index(cfg["eos"]) if cfg["eos"] in ids else len(ids)
    chu = "".join(MAY["ky_tu"].get(i, "") for i in ids[1:cuoi])
    tin = [x for i, x in zip(ids[1:], xs) if i > 3]
    return chu, (sum(tin) / len(tin) if tin else 0.0)


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
    import numpy as np
    from PIL import Image, ImageOps

    anh = ImageOps.exif_transpose(Image.open(io.BytesIO(du_lieu))).convert("RGB")
    if max(anh.size) > CANH_TOI_DA:
        anh.thumbnail((CANH_TOI_DA, CANH_TOI_DA))
    dong = []
    for p in phat_hien(np.ascontiguousarray(np.asarray(anh)[:, :, ::-1])):  # mô hình học trên ảnh BGR như OpenCV
        xs, ys = [float(q[0]) for q in p], [float(q[1]) for q in p]
        khung = [max(min(xs) - 4, 0), max(min(ys) - 4, 0), min(max(xs) + 4, anh.width), min(max(ys) + 4, anh.height)]
        if khung[2] - khung[0] < 4 or khung[3] - khung[1] < 4:
            continue
        chu, tin_cay = nhan_dang(anh.crop(tuple(int(v) for v in khung)))
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
