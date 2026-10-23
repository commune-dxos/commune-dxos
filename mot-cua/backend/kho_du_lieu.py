# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Khử định danh dữ liệu xuất sang kho lịch sử (#80). Hàm thuần, chỉ thư viện chuẩn (test đơn vị:
tests/test_kho_du_lieu.py); phần đọc PostgREST, ghi Parquet, chạy dbt ở mot-cua/kho-du-lieu/chay.py.

Chỉ giữ cột trong danh sách trắng COT_*; mọi khóa khác (kể cả khi PostgREST lỡ trả thêm) bị bỏ, và
khóa trong KHOA_CA_NHAN ở bất kỳ mức nào làm dừng xuất (LoiKhuDinhDanh): không bao giờ ghi ra Parquet
họ tên, số điện thoại, sub người nộp hay chữ tự do (lý do). Role dich_vu_bao_cao của CSDL cũng không
được đọc các cột đó (migration 009), đây là lớp thứ hai.

Thời điểm đổi sang giờ Việt Nam KHÔNG kèm múi giờ ("2026-10-23T08:30:00"), để DuckDB/dbt tính ngày,
tháng, trễ hạn (17:00 ngày hạn) mà không cần dữ liệu múi giờ. `thang` = tháng đóng hồ sơ (YYYY-MM),
cùng `thu_tuc` là khóa phân vùng Parquet.
"""

import datetime

VN = datetime.timezone(datetime.timedelta(hours=7))
TRANG_THAI_DONG = ("hoan_tat", "tu_choi")
KHOA_CA_NHAN = {"ho_ten_nguoi_nop", "so_dien_thoai", "nguoi_nop_sub", "nguoi_sub", "ly_do", "ho_ten", "email",
                "cccd", "dia_chi", "ngay_sinh", "nguoi_tai_sub", "nguoi_yeu_cau_sub", "ten_tep"}

# PostgREST (tài khoản dịch vụ mot_cua_bao_cao, RLS: chỉ hồ sơ đã đóng). Sắp theo id để phân trang ổn định.
DUONG_HO_SO = ("/ho_so?select=id,ma_ho_so,trang_thai,ngay_nhan,han_xu_ly,ngay_hoan_tat,"
               "thu_tuc:thu_tuc_id(ma,ten,so_ngay_xu_ly,linh_vuc:linh_vuc_id(ma,ten))&order=id")
DUONG_LICH_SU = "/lich_su_trang_thai?select=id,ho_so_id,tu_trang_thai,den_trang_thai,buoc,nguon,luc&order=id"
DUONG_NGAY_NGHI = "/ngay_nghi?select=ngay&order=ngay"

# Cột Parquet theo thứ tự, kiểu DuckDB.
COT_HO_SO = {"ho_so_id": "UUID", "ma_ho_so": "VARCHAR", "thu_tuc": "VARCHAR", "ten_thu_tuc": "VARCHAR",
             "linh_vuc": "VARCHAR", "ten_linh_vuc": "VARCHAR", "so_ngay_quy_dinh": "INTEGER",
             "trang_thai": "VARCHAR", "ngay_nhan": "TIMESTAMP", "han_xu_ly": "DATE", "ngay_hoan_tat": "TIMESTAMP",
             "thang": "VARCHAR"}
COT_LICH_SU = {"id": "BIGINT", "ho_so_id": "UUID", "tu_trang_thai": "VARCHAR", "den_trang_thai": "VARCHAR",
               "buoc": "VARCHAR", "nguon": "VARCHAR", "luc": "TIMESTAMP", "thang": "VARCHAR", "thu_tuc": "VARCHAR"}
COT_NGAY_NGHI = {"ngay": "DATE"}


class LoiKhuDinhDanh(Exception):
    """Dữ liệu đầu vào có khóa cá nhân hoặc thiếu trường bắt buộc: dừng, không ghi gì."""


def gio_vn(iso):
    """timestamptz ISO 8601 (PostgREST) → giờ Việt Nam không múi giờ, chính xác tới giây."""
    if not iso:
        return None
    t = datetime.datetime.fromisoformat(iso.replace("Z", "+00:00"))
    if t.tzinfo is None:
        raise LoiKhuDinhDanh(f"thời điểm thiếu múi giờ: {iso}")
    return t.astimezone(VN).replace(tzinfo=None, microsecond=0).isoformat()


def _kiem_khoa(gia_tri, duong=""):
    if isinstance(gia_tri, dict):
        for k, v in gia_tri.items():
            if k in KHOA_CA_NHAN:
                raise LoiKhuDinhDanh(f"dữ liệu đầu vào có khóa cá nhân {duong}{k}")
            _kiem_khoa(v, f"{duong}{k}.")
    elif isinstance(gia_tri, list):
        for v in gia_tri:
            _kiem_khoa(v, duong)


def ho_so(dong):
    """Một dòng ho_so (PostgREST, kèm thu_tuc → linh_vuc) → bản ghi Parquet."""
    _kiem_khoa(dong)
    if dong.get("trang_thai") not in TRANG_THAI_DONG or not dong.get("ngay_hoan_tat"):
        raise LoiKhuDinhDanh(f"hồ sơ {dong.get('ma_ho_so')} chưa đóng")
    tt = dong.get("thu_tuc") or {}
    lv = tt.get("linh_vuc") or {}
    dong_luc = gio_vn(dong["ngay_hoan_tat"])
    return {"ho_so_id": dong["id"], "ma_ho_so": dong["ma_ho_so"], "thu_tuc": tt["ma"], "ten_thu_tuc": tt["ten"],
            "linh_vuc": lv["ma"], "ten_linh_vuc": lv["ten"], "so_ngay_quy_dinh": tt.get("so_ngay_xu_ly"),
            "trang_thai": dong["trang_thai"], "ngay_nhan": gio_vn(dong["ngay_nhan"]), "han_xu_ly": dong.get("han_xu_ly"),
            "ngay_hoan_tat": dong_luc, "thang": dong_luc[:7]}


def lich_su(dong, ho_so_theo_id):
    """Một dòng lich_su_trang_thai → bản ghi Parquet, phân vùng theo hồ sơ của nó; hồ sơ không có
    trong lần xuất (chưa đóng) → None."""
    _kiem_khoa(dong)
    hs = ho_so_theo_id.get(dong["ho_so_id"])
    if hs is None:
        return None
    return {"id": dong["id"], "ho_so_id": dong["ho_so_id"], "tu_trang_thai": dong.get("tu_trang_thai"),
            "den_trang_thai": dong["den_trang_thai"], "buoc": dong.get("buoc"), "nguon": dong["nguon"],
            "luc": gio_vn(dong["luc"]), "thang": hs["thang"], "thu_tuc": hs["thu_tuc"]}


def chuan_bi(du_lieu):
    """{"ho_so", "lich_su_trang_thai", "ngay_nghi"} như PostgREST trả → bản ghi đã khử định danh, sắp
    theo khóa (cùng đầu vào → cùng thứ tự → cùng tệp Parquet)."""
    ds_hs = sorted((ho_so(d) for d in du_lieu.get("ho_so", [])), key=lambda r: r["ho_so_id"])
    theo_id = {r["ho_so_id"]: r for r in ds_hs}
    ds_ls = sorted((r for r in (lich_su(d, theo_id) for d in du_lieu.get("lich_su_trang_thai", [])) if r),
                   key=lambda r: r["id"])
    ds_nn = sorted({d["ngay"] for d in du_lieu.get("ngay_nghi", [])})
    return {"ho_so": ds_hs, "lich_su_trang_thai": ds_ls, "ngay_nghi": [{"ngay": n} for n in ds_nn]}
