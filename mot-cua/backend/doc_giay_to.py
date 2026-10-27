# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Đọc giấy tờ bằng OCR (#93), phần thuần: trích trường từ các dòng chữ mà dịch vụ OCR của nền tảng trả về,
kiểm dữ liệu người dùng gửi lên. Không gọi mạng, test được bằng unittest.

Loại giấy tờ và trường khai ở mot-cua/doc-giay-to/loai-giay-to.json, khóa trùng mã thành phần hồ sơ của gói
thủ tục (giay_chung_sinh, giay_to_tuy_than…): thêm loại giấy tờ = thêm một mục JSON, không sửa mã.

Trích trường: duyệt dòng từ trên xuống. Dòng có dấu ':' thì phần trước là nhãn, so với nhan_khop sau khi bỏ dấu
và chữ hoa (OCR hay đọc sai dấu: "Dư định" = "Dự định"), cho sai lệch nhỏ (tỉ lệ giống ≥ 0,85); dòng không có ':'
thì nhận khi bắt đầu bằng một nhãn từ hai chữ trở lên. Mỗi trường lấy dòng khớp đầu tiên. Giá trị chuẩn hóa theo
kiểu (ngày dd/mm/yyyy, số định danh 12 chữ số…); độ tin cậy thấp hoặc sai dạng → can_kiem_tra, cổng hiện nổi bật
để người dùng sửa. Máy chỉ ĐỀ XUẤT: giá trị chỉ được lưu sau khi cán bộ xác nhận (HITL).
"""

import json
import os
import re

import rag

TEP_LOAI = os.environ.get("DXOS_LOAI_GIAY_TO",
                          os.path.join(os.path.dirname(__file__), "..", "doc-giay-to", "loai-giay-to.json"))
NGUONG_TIN_CAY = 0.9
TOI_DA_GIA_TRI = 200
KIEU = ("chu", "ho_ten", "ngay", "nam", "so_dinh_danh", "gioi_tinh", "so")


class LoiDuLieu(ValueError):
    """Dữ liệu người dùng gửi lên sai (thông điệp tiếng Việt, trả 400)."""


def doc_loai(duong=TEP_LOAI):
    """→ {mã loại: {"ten", "truong": [...]}} đã kiểm. Sai định dạng → ValueError (dừng khi khởi động)."""
    with open(duong, encoding="utf-8") as f:
        du_lieu = json.load(f)
    loai = {}
    for ma, mo_ta in du_lieu.items():
        if ma.startswith("$"):
            continue
        if not re.fullmatch(r"[a-z][a-z0-9_]{1,62}", ma) or not mo_ta.get("ten") or not mo_ta.get("truong"):
            raise ValueError(f"loại giấy tờ {ma!r}: cần mã a-z0-9_, 'ten' và 'truong'")
        thay = set()
        for t in mo_ta["truong"]:
            if not re.fullmatch(r"[a-z][a-z0-9_]{1,62}", t.get("ma", "")) or t["ma"] in thay:
                raise ValueError(f"loại {ma}: mã trường {t.get('ma')!r} sai hoặc trùng")
            if t.get("kieu", "chu") not in KIEU or not t.get("nhan") or not t.get("nhan_khop"):
                raise ValueError(f"loại {ma}, trường {t['ma']}: cần nhan, nhan_khop, kieu thuộc {KIEU}")
            thay.add(t["ma"])
        loai[ma] = {"ten": mo_ta["ten"], "truong": mo_ta["truong"]}
    return loai


def cong_khai(loai):
    """Phần gửi cho web: tên loại, mã + nhãn + kiểu từng trường (không gửi nhãn khớp)."""
    return {ma: {"ten": m["ten"], "truong": [{"ma": t["ma"], "nhan": t["nhan"], "kieu": t.get("kieu", "chu")}
                                           for t in m["truong"]]} for ma, m in loai.items()}


def _chuan(chu):
    return " ".join(rag.tu(chu))


def _giong(a, b):
    """Tỉ lệ giống theo khoảng cách Levenshtein (1 = trùng)."""
    if a == b:
        return 1.0
    if not a or not b:
        return 0.0
    truoc = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        hien = [i]
        for j, cb in enumerate(b, 1):
            hien.append(min(truoc[j] + 1, hien[j - 1] + 1, truoc[j - 1] + (ca != cb)))
        truoc = hien
    return 1 - truoc[-1] / max(len(a), len(b))


def _viet_hoa_ten(chu):
    return " ".join(w[:1].upper() + w[1:].lower() for w in chu.split())


def chuan_hoa(kieu, gia_tri):
    """→ (giá trị chuẩn, hợp lệ?). Giá trị không chuẩn hóa được thì giữ nguyên chữ, hợp lệ = False."""
    g = " ".join((gia_tri or "").split()).strip(" .;,")
    if kieu == "ngay":
        m = re.search(r"(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{4})", g) or \
            re.search(r"ngày\s*(\d{1,2})\s*tháng\s*(\d{1,2})\s*năm\s*(\d{4})", g, re.I)
        if m:
            d, t, n = (int(x) for x in m.groups())
            if 1 <= d <= 31 and 1 <= t <= 12 and 1900 <= n <= 2100:
                return f"{d:02d}/{t:02d}/{n}", True
        return g, False
    if kieu == "nam":
        m = re.search(r"\b(19|20)\d{2}\b", g)
        return (m.group(0), True) if m else (g, False)
    if kieu == "so_dinh_danh":
        so = re.sub(r"\D", "", g)
        return (so, True) if len(so) == 12 else (g, False)
    if kieu == "gioi_tinh":
        k = rag.bo_dau(g).strip()
        return ("Nam", True) if k == "nam" else ("Nữ", True) if k == "nu" else (g, False)
    if kieu == "so":
        m = re.search(r"\d[\d.]*", g)
        return (m.group(0).replace(".", ""), True) if m else (g, False)
    if kieu == "ho_ten":
        return _viet_hoa_ten(g), bool(g) and not re.search(r"\d", g)
    return g, bool(g)


def _khop(dong_chuan, nhan_chuan, co_hai_cham):
    if co_hai_cham:
        return _giong(dong_chuan, nhan_chuan) >= 0.85
    return len(nhan_chuan.split()) >= 2 and dong_chuan.startswith(nhan_chuan + " ")


def trich_truong(dong, loai):
    """dong: [{"chu", "tin_cay"}] (thứ tự đọc) → {mã trường: {"gia_tri", "tin_cay", "can_kiem_tra", "dong"}}.
    Trường không thấy thì vắng mặt."""
    kq = {}
    for d in dong:
        chu = d.get("chu") or ""
        if ":" in chu:
            nhan, gia_tri = chu.split(":", 1)
            nhan_chuan = _chuan(nhan)
        else:
            nhan_chuan, gia_tri = _chuan(chu), None
        tot = None
        for t in loai["truong"]:
            if t["ma"] in kq:
                continue
            for nk in t["nhan_khop"]:
                nk_chuan = _chuan(nk)
                if _khop(nhan_chuan, nk_chuan, gia_tri is not None):
                    # Không có ':': phần còn lại sau nhãn (theo số từ của nhãn) là giá trị.
                    g = gia_tri if gia_tri is not None else " ".join(chu.split()[len(nk_chuan.split()):])
                    if tot is None or len(nk_chuan) > tot[2]:
                        tot = (t, g, len(nk_chuan))
        if tot:
            t, g, _ = tot
            gia_tri_chuan, hop_le = chuan_hoa(t.get("kieu", "chu"), g)
            if not gia_tri_chuan:
                continue
            tin_cay = round(float(d.get("tin_cay") or 0), 3)
            kq[t["ma"]] = {"gia_tri": gia_tri_chuan[:TOI_DA_GIA_TRI], "tin_cay": tin_cay,
                           "can_kiem_tra": (not hop_le) or tin_cay < NGUONG_TIN_CAY, "dong": chu[:300]}
    return kq


def kiem_truong_gui(loai, truong):
    """Giá trị công dân khai / cán bộ xác nhận gửi lên: {mã trường: chuỗi}. Chỉ trường của loại, chuỗi ≤ 200 ký tự;
    chuỗi rỗng = bỏ trường. → dict đã gọn khoảng trắng. Sai → LoiDuLieu."""
    if not isinstance(truong, dict):
        raise LoiDuLieu("truong phải là object {mã trường: giá trị}")
    hop_le = {t["ma"] for t in loai["truong"]}
    kq = {}
    for ma, gia_tri in truong.items():
        if ma not in hop_le:
            raise LoiDuLieu(f"Trường {ma!r} không thuộc loại giấy tờ này")
        if gia_tri is None:
            continue
        if not isinstance(gia_tri, str):
            raise LoiDuLieu(f"Giá trị trường {ma} phải là chữ")
        g = " ".join("".join(c for c in gia_tri if c.isprintable()).split())
        if len(g) > TOI_DA_GIA_TRI:
            raise LoiDuLieu(f"Giá trị trường {ma} tối đa {TOI_DA_GIA_TRI} ký tự")
        if g:
            kq[ma] = g
    return kq


def so_truong_sua(truong_may, truong_xac_nhan):
    """Các trường cán bộ chốt khác máy đọc (kể cả máy không đọc được) → [mã trường], để thống kê độ chính xác."""
    may = {k: (v or {}).get("gia_tri") for k, v in (truong_may or {}).items()}
    return sorted(k for k in set(may) | set(truong_xac_nhan) if may.get(k) != truong_xac_nhan.get(k))
