# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Test khử định danh của kho dữ liệu (#80, kho_du_lieu.py): chỉ cột trong danh sách trắng, khóa cá
nhân ở bất kỳ mức nào làm dừng xuất, chỉ hồ sơ đã đóng, giờ Việt Nam không múi giờ, cùng đầu vào →
cùng kết quả (không phụ thuộc thứ tự PostgREST trả). Không cần Docker, DuckDB hay dbt.

Chạy: make test-backend
"""

import copy
import os
import random
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import kho_du_lieu  # noqa: E402

TT = {"ma": "KS01", "ten": "Đăng ký khai sinh", "so_ngay_xu_ly": 3, "linh_vuc": {"ma": "ho_tich", "ten": "Hộ tịch"}}
HS = {"id": "11111111-1111-4111-8111-111111111111", "ma_ho_so": "HS20261023-000001", "trang_thai": "hoan_tat",
      "ngay_nhan": "2026-10-23T01:00:00.123456+00:00", "han_xu_ly": "2026-10-28",
      "ngay_hoan_tat": "2026-10-31T17:30:00+00:00", "thu_tuc": TT}
LS = {"id": 7, "ho_so_id": HS["id"], "tu_trang_thai": "dang_xu_ly", "den_trang_thai": "hoan_tat", "buoc": "phe_duyet",
      "nguon": "quy_trinh", "luc": "2026-10-31T17:30:00+00:00"}


class KhuDinhDanh(unittest.TestCase):
    def test_ho_so_chi_cot_danh_sach_trang(self):
        r = kho_du_lieu.ho_so(HS)
        self.assertEqual(list(r), list(kho_du_lieu.COT_HO_SO))
        self.assertEqual((r["thu_tuc"], r["linh_vuc"], r["ten_linh_vuc"], r["so_ngay_quy_dinh"]),
                         ("KS01", "ho_tich", "Hộ tịch", 3))

    def test_gio_viet_nam_khong_mui_gio_va_thang_theo_gio_vn(self):
        r = kho_du_lieu.ho_so(HS)
        self.assertEqual(r["ngay_nhan"], "2026-10-23T08:00:00")
        # 17:30 UTC ngày 31/10 là 00:30 ngày 01/11 giờ Việt Nam → tháng 11.
        self.assertEqual((r["ngay_hoan_tat"], r["thang"]), ("2026-11-01T00:30:00", "2026-11"))
        with self.assertRaises(kho_du_lieu.LoiKhuDinhDanh):
            kho_du_lieu.gio_vn("2026-10-23T01:00:00")

    def test_khoa_ca_nhan_o_moi_muc_lam_dung_xuat(self):
        for them in ({"ho_ten_nguoi_nop": "Nguyễn Văn A"}, {"so_dien_thoai": "0900000001"},
                     {"nguoi_nop_sub": "abc"}, {"thu_tuc": {**TT, "linh_vuc": {**TT["linh_vuc"], "ho_ten": "x"}}}):
            with self.subTest(them=list(them)):
                with self.assertRaises(kho_du_lieu.LoiKhuDinhDanh):
                    kho_du_lieu.ho_so({**HS, **them})
        for them in ({"nguoi_sub": "can-bo"}, {"ly_do": "Thiếu giấy tờ của ông A"}):
            with self.assertRaises(kho_du_lieu.LoiKhuDinhDanh):
                kho_du_lieu.lich_su({**LS, **them}, {HS["id"]: kho_du_lieu.ho_so(HS)})

    def test_khoa_la_khong_ca_nhan_bi_bo(self):
        r = kho_du_lieu.ho_so({**HS, "can_bo_xu_ly_id": "x", "ghi_chu_noi_bo": "y"})
        self.assertNotIn("can_bo_xu_ly_id", r)
        self.assertNotIn("ghi_chu_noi_bo", r)

    def test_chi_ho_so_da_dong(self):
        for tt in ("moi", "dang_xu_ly", "cho_bo_sung", "cho_phe_duyet"):
            with self.assertRaises(kho_du_lieu.LoiKhuDinhDanh):
                kho_du_lieu.ho_so({**HS, "trang_thai": tt})
        with self.assertRaises(kho_du_lieu.LoiKhuDinhDanh):
            kho_du_lieu.ho_so({**HS, "ngay_hoan_tat": None})

    def test_lich_su_theo_phan_vung_cua_ho_so_bo_ho_so_chua_dong(self):
        theo_id = {HS["id"]: kho_du_lieu.ho_so(HS)}
        r = kho_du_lieu.lich_su(LS, theo_id)
        self.assertEqual(list(r), list(kho_du_lieu.COT_LICH_SU))
        self.assertEqual((r["thang"], r["thu_tuc"]), ("2026-11", "KS01"))
        self.assertIsNone(kho_du_lieu.lich_su({**LS, "ho_so_id": "khac"}, theo_id))

    def test_cung_dau_vao_cung_ket_qua_khong_phu_thuoc_thu_tu(self):
        hs2 = {**HS, "id": "00000000-0000-4000-8000-000000000002", "ma_ho_so": "HS2"}
        du_lieu = {"ho_so": [HS, hs2], "lich_su_trang_thai": [LS, {**LS, "id": 3}, {**LS, "id": 9, "ho_so_id": hs2["id"]}],
                   "ngay_nghi": [{"ngay": "2026-09-02"}, {"ngay": "2026-09-01"}, {"ngay": "2026-09-02"}]}
        dao = copy.deepcopy(du_lieu)
        for v in dao.values():
            random.Random(7).shuffle(v)
        kq = kho_du_lieu.chuan_bi(du_lieu)
        self.assertEqual(kq, kho_du_lieu.chuan_bi(dao))
        self.assertEqual([r["ho_so_id"] for r in kq["ho_so"]], sorted([HS["id"], hs2["id"]]))
        self.assertEqual([r["id"] for r in kq["lich_su_trang_thai"]], [3, 7, 9])
        self.assertEqual(kq["ngay_nghi"], [{"ngay": "2026-09-01"}, {"ngay": "2026-09-02"}])


if __name__ == "__main__":
    unittest.main()
