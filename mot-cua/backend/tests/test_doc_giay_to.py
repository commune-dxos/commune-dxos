# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Test đọc giấy tờ bằng OCR + cán bộ xác nhận (#93): tệp loại giấy tờ của repo hợp lệ; trích trường từ kết quả OCR
THẬT của hai ảnh mẫu giả (tests/du-lieu/ocr-*.json, dịch vụ nen-tang/ocr chạy PP-OCRv5_mobile_det + VietOCR trên ONNX
Runtime ngày 26/10/2026, trùng từng dòng với bản PaddleX + PyTorch trước đó); nhãn đọc sai dấu,
thiếu dấu ':', dòng tiêu đề không bị nhận nhầm; chuẩn hóa ngày, số định danh, giới tính; kiểm giá trị người dùng gửi;
endpoint của main.py (đọc thử không lưu, công dân khai, cán bộ đọc lại/xác nhận, quyền theo vai, OCR chưa bật → 503)
với PostgREST, Garage, ClamAV, dịch vụ OCR giả. Không cần Docker.
"""

import io
import json
import logging
import os
import sys
import unittest
from unittest import mock

os.environ.setdefault("DXOS_JWT_ISSUER", "http://localhost:8080/realms/dxos")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import doc_giay_to  # noqa: E402
import main  # noqa: E402

logging.disable(logging.CRITICAL)
DU_LIEU = os.path.join(os.path.dirname(os.path.abspath(__file__)), "du-lieu")
LOAI = doc_giay_to.doc_loai()
TID = "44444444-4444-4444-8444-444444444444"
HID = "55555555-5555-4555-8555-555555555555"
PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 64


def ocr(ten):
    with open(os.path.join(DU_LIEU, f"ocr-{ten}.json"), encoding="utf-8") as f:
        return json.load(f)


def gia_tri(kq):
    return {k: v["gia_tri"] for k, v in kq.items()}


class TrichTruong(unittest.TestCase):
    def test_loai_cua_repo(self):
        self.assertEqual(set(LOAI), {"giay_chung_sinh", "giay_to_tuy_than"})
        cong_khai = doc_giay_to.cong_khai(LOAI)
        self.assertEqual(cong_khai["giay_to_tuy_than"]["truong"][0], {"ma": "ho_ten", "nhan": "Họ và tên", "kieu": "ho_ten"})
        self.assertNotIn("nhan_khop", json.dumps(cong_khai))

    def test_giay_chung_sinh_mau(self):
        kq = doc_giay_to.trich_truong(ocr("giay-chung-sinh")["dong"], LOAI["giay_chung_sinh"])
        self.assertEqual(gia_tri(kq), {
            "ho_ten_me": "Nguyễn Thị Mẫu Thử", "nam_sinh_me": "1995", "so_dinh_danh_me": "000195001234",
            "ngay_sinh_con": "12/10/2026", "noi_sinh": "Trạm y tế xã Mẫu", "gioi_tinh_con": "Nam",
            "can_nang_gam": "3200", "ten_con": "Trần Văn Thử Nghiệm"})
        self.assertTrue(all(not v["can_kiem_tra"] for v in kq.values()))

    def test_giay_to_tuy_than_mau(self):
        kq = doc_giay_to.trich_truong(ocr("giay-to-tuy-than")["dong"], LOAI["giay_to_tuy_than"])
        self.assertEqual(gia_tri(kq), {
            "ho_ten": "Trần Văn Mẫu", "so_dinh_danh": "000090001234", "ngay_sinh": "01/01/1990", "gioi_tinh": "Nam",
            "que_quan": "Xã Mẫu, tỉnh Thử Nghiệm", "noi_thuong_tru": "Thôn Một, xã Mẫu, tỉnh Thử Nghiệm"})

    def test_nhan_doc_sai_va_thieu_hai_cham(self):
        dong = [{"chu": "TÀI LIỆU MẪU - DỮ LIỆU GIẢ", "tin_cay": 0.9},          # "tại" một chữ: không nhận nhầm
                {"chu": "Họ và lên mẹ: nguyễn thị mẫu", "tin_cay": 0.86},     # OCR đọc "tên" thành "lên"
                {"chu": "Số định danh cá nhân 0001 9500 1234", "tin_cay": 0.95},
                {"chu": "Dư định đặt tên con là: Trần Văn A", "tin_cay": 0.97},
                {"chu": "Giới tính của con: nũ", "tin_cay": 0.95},
                {"chu": "Đã sinh con vào lúc: 8 giờ, ngày 3 tháng 9 năm 2026", "tin_cay": 0.95}]
        kq = doc_giay_to.trich_truong(dong, LOAI["giay_chung_sinh"])
        self.assertEqual(gia_tri(kq), {"ho_ten_me": "Nguyễn Thị Mẫu", "so_dinh_danh_me": "000195001234",
                                       "ten_con": "Trần Văn A", "gioi_tinh_con": "Nữ", "ngay_sinh_con": "03/09/2026"})
        self.assertTrue(kq["ho_ten_me"]["can_kiem_tra"])  # tin cậy 0,86 < 0,9
        self.assertNotIn("noi_sinh", kq)

    def test_gia_tri_sai_dang_can_kiem_tra(self):
        kq = doc_giay_to.trich_truong([{"chu": "Số định danh cá nhân: 12345", "tin_cay": 0.99},
                                       {"chu": "Ngày sinh: 31/13/1990", "tin_cay": 0.99}], LOAI["giay_to_tuy_than"])
        self.assertEqual((kq["so_dinh_danh"]["gia_tri"], kq["so_dinh_danh"]["can_kiem_tra"]), ("12345", True))
        self.assertTrue(kq["ngay_sinh"]["can_kiem_tra"])

    def test_chuan_hoa(self):
        self.assertEqual(doc_giay_to.chuan_hoa("ngay", "ngày 1-2-2000"), ("01/02/2000", True))
        self.assertEqual(doc_giay_to.chuan_hoa("ho_ten", "  trần  VĂN mẫu "), ("Trần Văn Mẫu", True))
        self.assertEqual(doc_giay_to.chuan_hoa("ho_ten", "Trần 2"), ("Trần 2", False))
        self.assertEqual(doc_giay_to.chuan_hoa("so", "3.200 gam"), ("3200", True))
        self.assertEqual(doc_giay_to.chuan_hoa("gioi_tinh", "Khác"), ("Khác", False))

    def test_kiem_truong_gui(self):
        l = LOAI["giay_to_tuy_than"]
        self.assertEqual(doc_giay_to.kiem_truong_gui(l, {"ho_ten": "  Trần  Văn Mẫu ", "gioi_tinh": "", "que_quan": None}),
                         {"ho_ten": "Trần Văn Mẫu"})
        for sai in ([], {"la": "x"}, {"ho_ten": 5}, {"ho_ten": "x" * 201}):
            with self.subTest(sai=sai), self.assertRaises(doc_giay_to.LoiDuLieu):
                doc_giay_to.kiem_truong_gui(l, sai)

    def test_so_truong_sua(self):
        may = {"ho_ten": {"gia_tri": "Trần Văn Mẩu"}, "gioi_tinh": {"gia_tri": "Nam"}}
        self.assertEqual(doc_giay_to.so_truong_sua(may, {"ho_ten": "Trần Văn Mẫu", "gioi_tinh": "Nam", "que_quan": "X"}),
                         ["ho_ten", "que_quan"])

    def test_tep_loai_sai(self):
        import tempfile
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump({"Loai Sai": {"ten": "x", "truong": [{"ma": "a1", "nhan": "A", "nhan_khop": ["a"]}]}}, f)
        self.addCleanup(os.remove, f.name)
        with self.assertRaises(ValueError):
            doc_giay_to.doc_loai(f.name)


def claims(vai, sub="sub-cd"):
    return {"sub": sub, "resource_access": {"dxos_api": {"roles": [vai]}}}


class Req:
    def __init__(self, du_lieu, query, loai="image/png"):
        self.query, self.rfile = query, io.BytesIO(du_lieu)
        self.headers = {"Content-Type": loai, "Content-Length": str(len(du_lieu))}


class Endpoint(unittest.TestCase):
    def setUp(self):
        self.ghi, self.ocr_goi = [], 0
        self.tep = {"id": TID, "ho_so_id": HID, "loai_mime": "image/png", "object_key": f"ho-so/{HID}/x.png",
                    "thanh_phan_yeu_cau": {"ma": "giay_to_tuy_than"},
                    "ho_so": {"trang_thai": "moi", "nguoi_nop_sub": "sub-cd"}}
        self.thay_tep = True
        p = [mock.patch.object(main, "pgrst", self._pgrst),
             mock.patch.object(main, "goi_ocr", self._ocr),
             mock.patch.object(main, "s3_doc", return_value=PNG),
             mock.patch.object(main.DICH_VU_TEP, "lay", return_value="tk-dv"),
             mock.patch.object(main.tep, "quet_clamav", return_value=(True, None))]
        for x in p:
            x.start()
            self.addCleanup(x.stop)

    def _ocr(self, du_lieu):
        self.ocr_goi += 1
        return ocr("giay-to-tuy-than")

    def _pgrst(self, token, method, path, body=None, prefer=None):
        if method == "GET" and path.startswith("/thanh_phan_ho_so"):
            return [self.tep] if (self.thay_tep or token == "tk-dv") else []
        if method == "POST" and path.startswith("/doc_giay_to"):
            self.ghi.append((token, body))
            if getattr(self, "da_xac_nhan", False):
                raise main.Loi(403, "Kết quả đọc giấy tờ đã được cán bộ xác nhận")
            return [{**body, "trang_thai": body.get("trang_thai", "cho_xac_nhan"), "truong_da_sua": []}]
        raise AssertionError(f"không mong đợi {method} {path}")

    def test_doc_thu_khong_luu(self):
        st, kq = main.doc_thu("tk", claims("cong_dan"), Req(PNG, {"loai": "giay_to_tuy_than"}))
        self.assertEqual((st, kq["truong"]["ho_ten"]["gia_tri"]), (200, "Trần Văn Mẫu"))
        self.assertEqual(self.ghi, [])

    def test_doc_thu_kiem_dau_vao(self):
        for req, ma in [(Req(PNG, {"loai": "la"}), 404), (Req(b"%PDF-1.7", {"loai": "giay_to_tuy_than"}, "application/pdf"), 415),
                        (Req(b"GIF89a", {"loai": "giay_to_tuy_than"}), 415), (Req(b"", {"loai": "giay_to_tuy_than"}), 400)]:
            with self.subTest(ma=ma):
                with self.assertRaises((main.Loi, main.tep.LoiTep)) as e:
                    main.doc_thu("tk", claims("cong_dan"), req)
                self.assertEqual(e.exception.status, ma)
        with mock.patch.object(main.tep, "quet_clamav", return_value=(False, "Eicar-Test-Signature")), \
                self.assertRaises(main.Loi) as e:
            main.doc_thu("tk", claims("cong_dan"), Req(PNG, {"loai": "giay_to_tuy_than"}))
        self.assertEqual((e.exception.status, self.ocr_goi), (422, 0))

    def test_ocr_chua_bat(self):
        with mock.patch.object(main, "goi_ocr", side_effect=main.Loi(503, "chưa bật")), self.assertRaises(main.Loi) as e:
            main.doc_thu("tk", claims("cong_dan"), Req(PNG, {"loai": "giay_to_tuy_than"}))
        self.assertEqual(e.exception.status, 503)

    def test_cong_dan_khai(self):
        st, kq = main.khai_giay_to("tk", claims("cong_dan"), {"truong": {"ho_ten": "Trần Văn Mẫu"}}, TID)
        self.assertEqual(st, 200)
        self.assertEqual(self.ghi, [("tk-dv", {"tep_id": TID, "ho_so_id": HID, "loai": "giay_to_tuy_than",
                                               "truong_cong_dan": {"ho_ten": "Trần Văn Mẫu"}})])

    def test_khai_bi_chan(self):
        ca = [(claims("can_bo"), {}, 403), (claims("cong_dan", "sub-khac"), {}, 403),
              (claims("cong_dan"), {"ho_so": {"trang_thai": "dang_xu_ly", "nguoi_nop_sub": "sub-cd"}}, 409),
              (claims("cong_dan"), {"thanh_phan_yeu_cau": {"ma": "to_khai"}}, 422)]
        for c, doi, ma in ca:
            with self.subTest(ma=ma, doi=doi):
                self.tep.update(doi)
                with self.assertRaises(main.Loi) as e:
                    main.khai_giay_to("tk", c, {"truong": {"ho_ten": "A"}}, TID)
                self.assertEqual(e.exception.status, ma)
                self.setUp()
        with self.assertRaises(main.Loi) as e:
            main.khai_giay_to("tk", claims("cong_dan"), {"truong": {"la": "x"}}, TID)
        self.assertEqual(e.exception.status, 400)

    def test_can_bo_doc_lai_va_xac_nhan(self):
        st, kq = main.doc_lai("tk", claims("can_bo", "sub-cb"), TID)
        self.assertEqual((st, kq["truong_may"]["ho_ten"]["gia_tri"], self.ocr_goi), (200, "Trần Văn Mẫu", 1))
        st, kq = main.xac_nhan_giay_to("tk", claims("can_bo", "sub-cb"), {"truong": {"ho_ten": "Trần Văn Mẫu"}}, TID)
        self.assertEqual(self.ghi[-1][1], {"tep_id": TID, "ho_so_id": HID, "loai": "giay_to_tuy_than",
                                           "trang_thai": "da_xac_nhan", "truong_xac_nhan": {"ho_ten": "Trần Văn Mẫu"},
                                           "xac_nhan_boi_sub": "sub-cb"})

    def test_xac_nhan_bi_chan(self):
        with self.assertRaises(main.Loi) as e:
            main.xac_nhan_giay_to("tk", claims("cong_dan"), {"truong": {"ho_ten": "A"}}, TID)
        self.assertEqual(e.exception.status, 403)
        with self.assertRaises(main.Loi) as e:
            main.xac_nhan_giay_to("tk", claims("can_bo"), {"truong": {}}, TID)
        self.assertEqual(e.exception.status, 400)
        self.da_xac_nhan = True
        with self.assertRaises(main.Loi) as e:
            main.xac_nhan_giay_to("tk", claims("can_bo"), {"truong": {"ho_ten": "A"}}, TID)
        self.assertEqual(e.exception.status, 409)
        self.thay_tep = False
        with mock.patch.object(main, "_ton_tai", return_value=True), self.assertRaises(main.Loi) as e:
            main.xac_nhan_giay_to("tk", claims("can_bo"), {"truong": {"ho_ten": "A"}}, TID)
        self.assertEqual(e.exception.status, 403)

    def test_doc_nen_sau_tai_len(self):
        with mock.patch.object(main.threading, "Thread") as th:
            main.doc_nen(TID, PNG)
            th.call_args.kwargs["target"]()
        self.assertEqual(self.ghi[-1][1]["truong_may"]["so_dinh_danh"]["gia_tri"], "000090001234")
        self.assertEqual(len(self.ghi[-1][1]["dong_may"]), 12)
        self.tep["thanh_phan_yeu_cau"] = {"ma": "to_khai"}
        self.ghi.clear()
        with mock.patch.object(main.threading, "Thread") as th:
            main.doc_nen(TID, PNG)
            th.call_args.kwargs["target"]()
        self.assertEqual(self.ghi, [])  # thành phần không có mẫu đọc: bỏ qua

    def test_doc_nen_ocr_tat_ghi_ly_do(self):
        with mock.patch.object(main, "goi_ocr", side_effect=main.Loi(503, "Chức năng đọc giấy tờ chưa bật")), \
                mock.patch.object(main.threading, "Thread") as th:
            main.doc_nen(TID, PNG)
            th.call_args.kwargs["target"]()
        self.assertEqual(self.ghi[-1][1]["loi_doc"], "Chức năng đọc giấy tờ chưa bật")


if __name__ == "__main__":
    unittest.main()
