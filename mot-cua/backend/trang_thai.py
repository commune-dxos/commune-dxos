# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Trạng thái hồ sơ (mot_cua.ho_so.trang_thai) theo bước Flowable (#73). Hàm thuần, không gọi
mạng (test: tests/test_trang_thai.py).

Flowable là nguồn đúng của tiến độ; cột trang_thai là bản chiếu để RLS, cổng công dân, báo cáo
đọc được mà không gọi Flowable. Ánh xạ bước → trạng thái của mỗi gói thủ tục được bộ nạp tính
sẵn (anh_xa) và lưu ở mot_cua.thu_tuc.trang_thai_buoc; lúc chạy chỉ việc tra (tinh).

Mặc định theo người nhận của userTask trong BPMN, gói không phải khai gì:
  assignee ${nguoiNopSub} (công dân)     → cho_bo_sung
  candidateGroups có lanh_dao            → cho_phe_duyet
  còn lại (nhóm lĩnh vực của thủ tục)    → dang_xu_ly
Gói đổi được từng bước bằng khóa `trang_thai_theo_buoc` của thu-tuc.yaml, mỗi mục `- <bước>:
<trạng thái>` (docs/thu-tuc.md), ví dụ `- tiep_nhan: moi` để hồ sơ còn "mới" tới khi tiếp nhận.
Quy trình kết thúc: biến ketQua (hoan_tat | tu_choi) do endEvent đặt.
"""

# Trạng thái khi hồ sơ đang chờ ở một bước; hoan_tat/tu_choi chỉ có khi quy trình kết thúc.
TRANG_THAI_BUOC = ("moi", "dang_xu_ly", "cho_bo_sung", "cho_phe_duyet")
KET_THUC = ("hoan_tat", "tu_choi")
DA_DONG = KET_THUC
# Nhiều bước mở cùng lúc (nhánh song song): lấy trạng thái đứng trước trong danh sách này.
UU_TIEN = ("cho_bo_sung", "dang_xu_ly", "cho_phe_duyet", "moi")
NHOM_LANH_DAO = "lanh_dao"
ASSIGNEE_CONG_DAN = "${nguoiNopSub}"


def mac_dinh(buoc):
    """buoc: một mục của kiem_bpmn.buoc_nguoi_xu_ly → trạng thái mặc định của bước đó."""
    if buoc.get("assignee") == ASSIGNEE_CONG_DAN:
        return "cho_bo_sung"
    if NHOM_LANH_DAO in (buoc.get("nhom") or []):
        return "cho_phe_duyet"
    return "dang_xu_ly"


def doc_ghi_de(cac_muc, cac_buoc):
    """Khóa trang_thai_theo_buoc của thu-tuc.yaml (danh sách chuỗi "bước: trạng thái") →
    ({bước: trạng thái}, lỗi). cac_buoc: id các userTask của BPMN."""
    ghi_de, loi = {}, []
    for muc in cac_muc or []:
        buoc, hai_cham, tt = (muc if isinstance(muc, str) else "").partition(":")
        buoc, tt = buoc.strip(), tt.strip()
        if not hai_cham or not buoc or not tt:
            loi.append(f"trang_thai_theo_buoc: mục {muc!r} phải có dạng '<bước>: <trạng thái>'")
        elif buoc not in cac_buoc:
            loi.append(f"trang_thai_theo_buoc: bước '{buoc}' không phải userTask của quy trình")
        elif tt not in TRANG_THAI_BUOC:
            loi.append(f"trang_thai_theo_buoc: bước '{buoc}' có trạng thái '{tt}' "
                       f"(chỉ nhận {', '.join(TRANG_THAI_BUOC)}; hoan_tat/tu_choi do endEvent đặt ketQua)")
        elif buoc in ghi_de:
            loi.append(f"trang_thai_theo_buoc: bước '{buoc}' khai hai lần")
        else:
            ghi_de[buoc] = tt
    return ghi_de, loi


def anh_xa(cac_buoc, ghi_de=None):
    """{id userTask: mục buoc_nguoi_xu_ly} + ghi đè của gói → {bước: trạng thái} cho MỌI bước."""
    return {bid: (ghi_de or {}).get(bid) or mac_dinh(b) for bid, b in cac_buoc.items()}


def tinh(hien_tai, buoc_dang_mo, bang, ket_qua=None, da_ket_thuc=False):
    """→ trạng thái mới, hoặc None nếu không phải đổi.

    hien_tai      trang_thai trong CSDL
    buoc_dang_mo  taskDefinitionKey các task đang mở
    bang          thu_tuc.trang_thai_buoc (bước lạ → dang_xu_ly)
    ket_qua       biến ketQua khi quy trình đã kết thúc
    Quy tắc: hồ sơ đã đóng không đổi nữa; "moi" chỉ có trước lần tiếp nhận đầu tiên (quay lại
    bước khai moi, ví dụ sau khi bổ sung, thì là dang_xu_ly); không còn bước mở mà quy trình chưa
    kết thúc (đang ở service task, hẹn giờ) hoặc kết thúc không có ketQua thì giữ nguyên."""
    if hien_tai in DA_DONG:
        return None
    if da_ket_thuc:
        moi = ket_qua if ket_qua in KET_THUC else None
    else:
        cac_tt = {(bang or {}).get(b) or "dang_xu_ly" for b in buoc_dang_mo}
        moi = next((tt for tt in UU_TIEN if tt in cac_tt), None)
        if moi == "moi" and hien_tai != "moi":
            moi = "dang_xu_ly"
    return moi if moi and moi != hien_tai else None


def ly_do(trang_thai, ghi_chu, ten_buoc):
    """Lý do ghi vào ho_so.ly_do (bắt buộc với cho_bo_sung, tu_choi): ghi chú của người xử lý,
    không có thì câu mặc định. Trạng thái khác → None (giữ lý do cũ)."""
    if trang_thai not in ("cho_bo_sung", "tu_choi"):
        return None
    if isinstance(ghi_chu, str) and ghi_chu.strip():
        return ghi_chu.strip()[:1000]
    if trang_thai == "cho_bo_sung":
        return f"Cán bộ yêu cầu bổ sung hồ sơ ({ten_buoc})" if ten_buoc else "Cán bộ yêu cầu bổ sung hồ sơ"
    return f"Hồ sơ không được giải quyết ({ten_buoc})" if ten_buoc else "Hồ sơ không được giải quyết"
