#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Sinh ảnh giấy tờ mẫu GIẢ để thử OCR (#93): mot-cua/web-cong-dan/public/mau-gia/*.png.

Người dân tải ảnh này ở bước nộp hồ sơ để thử "Đọc thông tin từ ảnh"; smoke dùng cùng ảnh. Mọi thông tin là
bịa (tên "Mẫu", "Thử", số định danh toàn số 0 ở đầu), có dải đỏ và chữ chìm "DỮ LIỆU GIẢ"; bố cục cố ý KHÁC giấy
tờ thật (không quốc huy, không ảnh chân dung, không mã QR). Không bao giờ thay bằng ảnh giấy tờ thật.

Công cụ cho người phát triển (không chạy trong sản phẩm). Cần Pillow và phông Be Vietnam Pro (SIL OFL-1.1) dạng TTF:
  python3 -m venv .venv && .venv/bin/pip install Pillow
  tải BeVietnamPro-Regular.ttf, BeVietnamPro-Bold.ttf từ https://github.com/google/fonts/tree/main/ofl/bevietnampro
  .venv/bin/python scripts/sinh_giay_to_gia.py <thư mục chứa hai tệp TTF>
"""

import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

RA = os.path.join(os.path.dirname(__file__), "..", "mot-cua", "web-cong-dan", "public", "mau-gia")
NEN = (250, 248, 240)
DO = (190, 30, 30)

GIAY = {
    "giay-chung-sinh.png": {
        "dau": ["CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", "Độc lập - Tự do - Hạnh phúc"],
        "co_quan": "TRẠM Y TẾ XÃ MẪU",
        "tieu_de": "GIẤY CHỨNG SINH",
        "dong": [
            "Họ và tên mẹ: Nguyễn Thị Mẫu Thử",
            "Năm sinh: 1995",
            "Số định danh cá nhân: 000195001234",
            "Nơi thường trú: Thôn Một, xã Mẫu, tỉnh Thử Nghiệm",
            "Đã sinh con vào lúc: 08 giờ 30 phút, ngày 12/10/2026",
            "Tại: Trạm y tế xã Mẫu",
            "Số con trong lần sinh này: 1",
            "Giới tính của con: Nam",
            "Cân nặng: 3200 gam",
            "Dự định đặt tên con là: Trần Văn Thử Nghiệm",
        ],
    },
    "giay-to-tuy-than.png": {
        "dau": ["GIẤY TỜ TÙY THÂN MẪU DÙNG ĐỂ THỬ CHƯƠNG TRÌNH"],
        "co_quan": "COMMUNE DX-OS · DỮ LIỆU GIẢ",
        "tieu_de": "GIẤY TỜ TÙY THÂN (MẪU)",
        "dong": [
            "Họ và tên: Trần Văn Mẫu",
            "Số định danh cá nhân: 000090001234",
            "Ngày sinh: 01/01/1990",
            "Giới tính: Nam",
            "Quê quán: Xã Mẫu, tỉnh Thử Nghiệm",
            "Nơi thường trú: Thôn Một, xã Mẫu, tỉnh Thử Nghiệm",
        ],
    },
}


def ve(thong_tin, phong):
    rong, cao = 1400, 260 + 70 * len(thong_tin["dong"]) + 120
    anh = Image.new("RGB", (rong, cao), NEN)
    d = ImageDraw.Draw(anh)
    p = {k: ImageFont.truetype(os.path.join(phong, f"BeVietnamPro-{t}.ttf"), c)
         for k, (t, c) in {"dau": ("Bold", 28), "chu": ("Regular", 32), "tieu_de": ("Bold", 46),
                           "dai": ("Bold", 26), "chim": ("Bold", 120)}.items()}
    # Chữ chìm (nhạt, nằm dưới nội dung).
    chim = Image.new("L", (rong, cao), 0)
    ImageDraw.Draw(chim).text((rong // 2, cao // 2), "DỮ LIỆU GIẢ", font=p["chim"], fill=40, anchor="mm")
    anh.paste(Image.new("RGB", (rong, cao), (235, 200, 200)), mask=chim.rotate(18, center=(rong // 2, cao // 2)))
    d.rectangle((0, 0, rong, 44), fill=DO)
    d.text((rong // 2, 22), "TÀI LIỆU MẪU – DỮ LIỆU GIẢ – KHÔNG CÓ GIÁ TRỊ PHÁP LÝ", font=p["dai"], fill="white", anchor="mm")
    y = 80
    for dong in thong_tin["dau"]:
        d.text((rong // 2, y), dong, font=p["dau"], fill="black", anchor="mm")
        y += 42
    d.text((80, y + 10), thong_tin["co_quan"], font=p["dau"], fill="black")
    y += 90
    d.text((rong // 2, y), thong_tin["tieu_de"], font=p["tieu_de"], fill="black", anchor="mm")
    y += 70
    for dong in thong_tin["dong"]:
        d.text((90, y), dong, font=p["chu"], fill=(20, 20, 20))
        y += 70
    d.rectangle((0, cao - 44, rong, cao), fill=DO)
    d.text((rong // 2, cao - 22), "Ảnh sinh bằng scripts/sinh_giay_to_gia.py – chỉ dùng thử OCR", font=p["dai"], fill="white",
           anchor="mm")
    # Hơi mờ như ảnh chụp.
    return anh.filter(ImageFilter.GaussianBlur(0.6))


def main(argv):
    if len(argv) != 2:
        sys.exit(__doc__)
    os.makedirs(RA, exist_ok=True)
    for ten, thong_tin in GIAY.items():
        duong = os.path.join(RA, ten)
        ve(thong_tin, argv[1]).save(duong, optimize=True)
        print(f"đã ghi {os.path.relpath(duong)} ({os.path.getsize(duong) // 1024} KB)")


if __name__ == "__main__":
    main(sys.argv)
