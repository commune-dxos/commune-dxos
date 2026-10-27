#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Chuẩn bị mô hình cho dịch vụ OCR (#93). CHỈ chạy trong stage build `xuat-mo-hinh` của nen-tang/ocr/Dockerfile;
stage đó bị bỏ, image chạy thật chỉ nhận thư mục kết quả (tệp .onnx + .json), không có PyTorch hay VietOCR.

  1. Tải PP-OCRv5_mobile_det dạng ONNX do RapidOCR công bố (chuyển từ mô hình PaddleOCR, Apache-2.0), kiểm SHA-256.
  2. Tải cấu hình + trọng số VietOCR vgg_transformer từ nơi tác giả công bố, kiểm SHA-256.
  3. Dựng mô hình VietOCR bằng mã của gói `vietocr`, xuất ONNX thành hai phần cho giải mã tham lam (greedy) giống
     hàm `translate()` của VietOCR:
       vietocr_encoder.onnx  ảnh (1, 3, 32, W) → memory (S, 1, 256)       = cnn + transformer.forward_encoder
       vietocr_decoder.onnx  tgt (T, 1) int64, memory → xác suất (1, V)   = forward_decoder + softmax, bước cuối
  4. So kết quả ONNX Runtime với PyTorch trên một ảnh chữ dựng sẵn: lệch quá ngưỡng hoặc chữ khác → dừng build.
  5. Ghi vietocr.json (bảng ký tự, kích thước ảnh) và mo-hinh.json (nguồn, giấy phép, SHA-256 từng tệp).

Dùng: python xuat_mo_hinh.py <thư mục đích>
"""

import hashlib
import json
import math
import os
import sys
import urllib.request

PHAT_HIEN = {
    "ten": "PP-OCRv5_mobile_det",
    "tep": "pp-ocrv5-mobile-det.onnx",
    "url": "https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.10.0/onnx/PP-OCRv5/det/"
    "ch_PP-OCRv5_det_mobile.onnx",
    # SHA-256 trùng khóa RapidOCR ghim trong rapidocr/default_models.yaml (v3.10.0); kiểm lại ngày 26/10/2026.
    "sha256": "4d97c44a20d30a81aad087d6a396b08f786c4635742afc391f6621f5c6ae78ae",
    "giay_phep": "Apache-2.0",
    "nguon": "PaddleOCR (https://huggingface.co/PaddlePaddle/PP-OCRv5_mobile_det), bản ONNX của RapidOCR "
    "(https://www.modelscope.cn/models/RapidAI/RapidOCR)",
}
NGUON_VIETOCR = os.environ.get("OCR_NGUON_VIETOCR", "https://vocr.vn/data/vietocr").rstrip("/")
# Tệp của VietOCR bản vgg_transformer (https://github.com/pbcquoc/vietocr) → SHA-256 đã kiểm ngày 26/10/2026.
TEP_VIETOCR = {
    "config/base.yml": "9c8283fadb950f06f5d3400475f80d5355700ff315c9c48b7875e6ea66647d1c",
    "config/vgg-transformer.yml": "0df9feee197754c7381871e5dfd07c6f3e292a4853eece6f1af240923e57c907",
    "vgg_transformer.pth": "380512193a8b6cbf6fad80deacdc9b6939d10d473d199892fc6408d13775ea59",
}
OPSET = 17


def sha256(duong):
    h = hashlib.sha256()
    with open(duong, "rb") as f:
        for khoi in iter(lambda: f.read(1 << 20), b""):
            h.update(khoi)
    return h.hexdigest()


def tai(url, duong, sha):
    print(f"tải {url}", flush=True)
    with urllib.request.urlopen(url, timeout=600) as r, open(duong, "wb") as f:
        while khoi := r.read(1 << 20):
            f.write(khoi)
    if sha256(duong) != sha:
        os.remove(duong)
        sys.exit(f"{url}: SHA-256 không khớp bản đã kiểm, dừng")


def anh_thu():
    """Ba ảnh một dòng chữ tiếng Việt có dấu, dài ngắn khác nhau (phông mặc định của Pillow)."""
    from PIL import Image, ImageDraw, ImageFont

    phong = ImageFont.load_default(size=30)
    ds = []
    for chu in ("Nguyễn Thị Mẫu 1990", "Số định danh: 000090001234", "Xã Mẫu"):
        anh = Image.new("RGB", (int(ImageDraw.Draw(Image.new("RGB", (1, 1))).textlength(chu, font=phong)) + 16, 48),
                        "white")
        ImageDraw.Draw(anh).text((8, 6), chu, fill="black", font=phong)
        ds.append(anh)
    return ds


def main(dich):
    import numpy as np
    import onnxruntime as ort
    import torch
    import yaml
    from torch import nn
    from torch.nn import functional as F
    from vietocr.tool.config import Cfg
    from vietocr.tool.translate import build_model, process_input, translate

    os.makedirs(dich, exist_ok=True)
    tam = os.path.join(dich, ".tai")
    os.makedirs(tam, exist_ok=True)

    tai(PHAT_HIEN["url"], os.path.join(dich, PHAT_HIEN["tep"]), PHAT_HIEN["sha256"])
    for ten, sha in TEP_VIETOCR.items():
        tai(f"{NGUON_VIETOCR}/{ten}", os.path.join(tam, os.path.basename(ten)), sha)

    cfg = {}
    for ten in ("base.yml", "vgg-transformer.yml"):
        with open(os.path.join(tam, ten), encoding="utf-8") as f:
            cfg.update(yaml.safe_load(f))
    cfg = Cfg(cfg)
    cfg["device"] = "cpu"
    cfg["cnn"]["pretrained"] = False  # không tải trọng số ImageNet: nạp trọng số VietOCR ngay sau
    model, vocab = build_model(cfg)
    model.load_state_dict(torch.load(os.path.join(tam, "vgg_transformer.pth"), map_location="cpu", weights_only=True))
    model.eval()

    lm = model.transformer  # LanguageTransformer của VietOCR: pos_enc, embed_tgt, transformer (nn.Transformer), fc
    lop_ma_hoa, lop_giai_ma = lm.transformer.encoder.layers, lm.transformer.decoder.layers
    if any(lop.norm_first for lop in [*lop_ma_hoa, *lop_giai_ma]):
        sys.exit("VietOCR dùng norm_first, mã xuất chưa hỗ trợ")
    can_d = math.sqrt(lm.d_model)

    def chu_y(m, truy_van, nguon, che=None):
        """= nn.MultiheadAttention (batch 1, eval) viết lại bằng phép toán không ghim kích thước: bộ xuất ONNX
        TorchScript ghi cứng độ dài chuỗi lúc trace vào các Reshape của MultiheadAttention, chạy với chuỗi dài khác
        thì ONNX Runtime báo lỗi. Trọng số lấy nguyên từ mô hình."""
        e, h = m.embed_dim, m.num_heads
        w, b = m.in_proj_weight, m.in_proj_bias
        q = F.linear(truy_van, w[:e], b[:e]).reshape(-1, h, e // h).transpose(0, 1)
        k = F.linear(nguon, w[e:2 * e], b[e:2 * e]).reshape(-1, h, e // h).transpose(0, 1)
        v = F.linear(nguon, w[2 * e:], b[2 * e:]).reshape(-1, h, e // h).transpose(0, 1)
        diem = torch.matmul(q, k.transpose(1, 2)) / math.sqrt(e // h)
        if che is not None:
            diem = diem + che
        ra = torch.matmul(torch.softmax(diem, dim=-1), v).transpose(0, 1).reshape(-1, 1, e)
        return m.out_proj(ra)

    def ffn(lop, x):
        return lop.linear2(F.relu(lop.linear1(x)))

    class MaHoa(nn.Module):
        def __init__(self):
            super().__init__()
            self.m = model

        def forward(self, anh):
            # = Vgg.forward (dropout không tác dụng khi eval) + LanguageTransformer.forward_encoder của VietOCR.
            # permute(-1, 0, 1) đổi thành permute(2, 0, 1): bộ xuất ghi nguyên chỉ số âm, ONNX Runtime từ chối.
            vgg = self.m.cnn.model
            conv = vgg.last_conv_1x1(vgg.features(anh))
            x = lm.pos_enc(conv.transpose(2, 3).flatten(2).permute(2, 0, 1) * can_d)
            for lop in lop_ma_hoa:
                x = lop.norm1(x + chu_y(lop.self_attn, x, x))
                x = lop.norm2(x + ffn(lop, x))
            return lm.transformer.encoder.norm(x)

    class GiaiMa(nn.Module):
        def __init__(self):
            super().__init__()
            self.m = model

        def forward(self, tgt, memory):
            # = LanguageTransformer.forward_decoder + softmax, chỉ trả xác suất của bước cuối như translate().
            x = lm.pos_enc(lm.embed_tgt(tgt) * can_d)
            che = torch.triu(torch.full_like(x[:, 0, :1].expand(-1, x.shape[0]), float("-inf")), diagonal=1)
            for lop in lop_giai_ma:
                x = lop.norm1(x + chu_y(lop.self_attn, x, x, che))
                x = lop.norm2(x + chu_y(lop.multihead_attn, x, memory))
                x = lop.norm3(x + ffn(lop, x))
            x = lm.transformer.decoder.norm(x)
            return torch.softmax(lm.fc(x[-1]), dim=-1)

    ds = cfg["dataset"]
    anh_kiem = [process_input(a, ds["image_height"], ds["image_min_width"], ds["image_max_width"]) for a in anh_thu()]
    tgt = torch.tensor([[1], [10], [20]], dtype=torch.long)
    ma_hoa, giai_ma = MaHoa().eval(), GiaiMa().eval()
    duong_mh, duong_gm = os.path.join(dich, "vietocr_encoder.onnx"), os.path.join(dich, "vietocr_decoder.onnx")
    with torch.no_grad():
        mem = ma_hoa(anh_kiem[0])
        torch.onnx.export(ma_hoa, (anh_kiem[0],), duong_mh, input_names=["anh"], output_names=["memory"],
                          dynamic_axes={"anh": {3: "rong"}, "memory": {0: "s"}}, opset_version=OPSET, dynamo=False)
        torch.onnx.export(giai_ma, (tgt, mem), duong_gm, input_names=["tgt", "memory"], output_names=["xac_suat"],
                          dynamic_axes={"tgt": {0: "t"}, "memory": {0: "s"}}, opset_version=OPSET, dynamo=False)

    # Kiểm trên các ảnh khác chiều rộng: giải mã tham lam bằng ONNX Runtime phải ra đúng chữ và xác suất như
    # translate() của VietOCR chạy PyTorch.
    s_mh = ort.InferenceSession(duong_mh, providers=["CPUExecutionProvider"])
    s_gm = ort.InferenceSession(duong_gm, providers=["CPUExecutionProvider"])
    for anh in anh_kiem:
        with torch.no_grad():
            cau_pt, xs_pt = translate(anh, model)
            mem_pt = lm.forward_encoder(model.cnn(anh)).numpy()
        chu_pt = vocab.decode(cau_pt[0].tolist())
        memory = s_mh.run(None, {"anh": anh.numpy().astype(np.float32)})[0]
        lech_mem = float(np.abs(memory - mem_pt).max())
        ids, xs = [1], []
        while len(ids) <= 129 and ids[-1] != 2:
            p = s_gm.run(None, {"tgt": np.array(ids, dtype=np.int64)[:, None], "memory": memory})[0][0]
            ids.append(int(p.argmax()))
            xs.append(float(p.max()))
        chu_ort = vocab.decode(ids)
        tin = [x for i, x in zip(ids[1:], xs) if i > 3]
        xs_ort = float(np.mean(tin)) if tin else 0.0
        print(f"kiểm ONNX (rộng {anh.shape[3]}): PyTorch {chu_pt!r} ({float(xs_pt[0]):.4f}) · ONNX Runtime "
              f"{chu_ort!r} ({xs_ort:.4f}) · lệch memory {lech_mem:.2e}", flush=True)
        if chu_pt != chu_ort or not chu_pt or lech_mem > 1e-3 or not math.isclose(xs_ort, float(xs_pt[0]), abs_tol=1e-3):
            sys.exit("ONNX lệch PyTorch, dừng")

    with open(os.path.join(dich, "vietocr.json"), "w", encoding="utf-8") as f:
        json.dump({"vocab": cfg["vocab"], "image_height": ds["image_height"], "image_min_width": ds["image_min_width"],
                   "image_max_width": ds["image_max_width"], "max_seq_length": 128, "sos": 1, "eos": 2},
                  f, ensure_ascii=False)
    ghi = {
        "phat_hien": PHAT_HIEN,
        "nhan_dang": {
            "ten": "VietOCR vgg_transformer",
            "giay_phep": "Apache-2.0",
            "nguon": f"https://github.com/pbcquoc/vietocr, trọng số {NGUON_VIETOCR}/vgg_transformer.pth",
            "sha256_goc": TEP_VIETOCR,
            "xuat": f"torch {torch.__version__}, opset {OPSET}",
        },
        "sha256": {t: sha256(os.path.join(dich, t)) for t in sorted(os.listdir(dich)) if t.endswith((".onnx", ".json"))},
    }
    for t in os.listdir(tam):
        os.remove(os.path.join(tam, t))
    os.rmdir(tam)
    with open(os.path.join(dich, "mo-hinh.json"), "w", encoding="utf-8") as f:
        json.dump(ghi, f, ensure_ascii=False, indent=2)
    for t in sorted(os.listdir(dich)):
        print(f"{t}: {os.path.getsize(os.path.join(dich, t)) / 1e6:.1f} MB", flush=True)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/mo-hinh")
