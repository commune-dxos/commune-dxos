# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Luồng thông báo cho chuông của cổng cán bộ (#56): GET /workflow/thong-bao/luong của mot-cua-api trả
Server-Sent Events. Phần thuần (định dạng khung SSE, vòng theo dõi), không gọi mạng: test đơn vị ở
tests/test_thong_bao.py.

Thông báo do consumer thông báo của mot-cua-worker ghi vào mot_cua.thong_bao (migration 013). mot-cua-api
không giữ kết nối CSDL riêng mà đọc qua PostgREST bằng token của chính cán bộ (RLS: chỉ thông báo của
mình), mỗi CHU_KY_GIAY giây; số chưa đọc hay thông báo mới nhất đổi thì đẩy sự kiện `thong-bao`, trình
duyệt tải lại danh sách qua /api/thong_bao. Khung chú thích `: nhip` giữ kết nối qua APISIX. Token hết hạn
thì gửi `het-han` rồi đóng: trình duyệt mở lại bằng token mới.
"""

import json
import time

CHU_KY_GIAY = 3
NHIP_GIAY = 15


def khung(su_kien, du_lieu):
    """→ bytes một sự kiện SSE (`event:` + `data:` JSON một dòng)."""
    return f"event: {su_kien}\ndata: {json.dumps(du_lieu, ensure_ascii=False, separators=(',', ':'))}\n\n".encode()


NHIP = b": nhip\n\n"


def trang_thai(ds_chua_doc):
    """Dòng thông báo chưa đọc (mới nhất trước, chỉ cột id) → {"chuaDoc", "moiNhat"}."""
    return {"chuaDoc": len(ds_chua_doc), "moiNhat": ds_chua_doc[0]["id"] if ds_chua_doc else None}


def theo_doi(lay_trang_thai, gui, het_han_luc, dau=None, bay_gio=time.time, ngu=time.sleep,
             chu_ky=CHU_KY_GIAY, nhip_giay=NHIP_GIAY):
    """Gửi trạng thái đầu (dau, hoặc đọc ngay), rồi mỗi chu_ky giây đọc lại; đổi thì gửi `thong-bao`, im lâu
    thì gửi nhịp. Dừng khi token hết hạn (gửi `het-han`) hoặc gui() lỗi (trình duyệt đã đóng).
    → số sự kiện đã gửi."""
    truoc = lay_trang_thai() if dau is None else dau
    gui(khung("thong-bao", truoc))
    da_gui, lan_cuoi = 1, bay_gio()
    while True:
        ngu(chu_ky)
        luc = bay_gio()
        if luc >= het_han_luc:
            gui(khung("het-han", {}))
            return da_gui + 1
        hien = lay_trang_thai()
        if hien != truoc:
            gui(khung("thong-bao", hien))
            truoc, da_gui, lan_cuoi = hien, da_gui + 1, luc
        elif luc - lan_cuoi >= nhip_giay:
            gui(NHIP)
            lan_cuoi = luc
