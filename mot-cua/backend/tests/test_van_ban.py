# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Test sổ văn bản (#78, main.py): vai được làm gì (văn thư vào sổ, soạn; lãnh đạo ký), kiểm dữ liệu đầu
vào, văn bản đến quét mã độc và xác minh chữ ký số nếu là PDF, văn bản đi cấp số TRƯỚC khi sinh PDF rồi
ký PAdES (PDF tải về xác minh hợp lệ), lỗi ký giữ số đã cấp, ký trùng không để lại tệp mồ côi. PostgREST,
Garage, ClamAV, Gotenberg là đối tượng giả; CA thử sinh trong test (test_ky_so). Không cần Docker.

Chạy: make test-backend
"""

import io
import os
import sys
import unittest
from unittest import mock

os.environ.setdefault("DXOS_JWT_ISSUER", "http://localhost:8080/realms/dxos")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import ky_so  # noqa: E402
import main  # noqa: E402
from test_ky_so import CA, pdf_toi_gian  # noqa: E402

VID = "33333333-3333-4333-8333-333333333333"


def claims(vai, sub="sub-nguoi-dung", **them):
    return {"sub": sub, "resource_access": {"dxos_api": {"roles": [vai]}}, **them}


class Req:
    def __init__(self, du_lieu, query, loai="application/pdf"):
        self.query, self.rfile = query, io.BytesIO(du_lieu)
        self.headers = {"Content-Type": loai, "Content-Length": str(len(du_lieu))}


DEN = {"ten": "cv-15.pdf", "loai": "Công văn", "ky_hieu": "15/UBND-VP", "ngay_van_ban": "2026-10-20",
       "trich_yeu": "Về việc rà soát hộ nghèo", "noi_gui": "UBND huyện Mẫu", "nguoi_ky": "Nguyễn Văn Huyện"}


class CoSo(unittest.TestCase):
    def setUp(self):
        self.goi, self.luu, self.xoa, self.html = [], {}, [], []
        self.ban_ghi = {"id": VID, "chieu": "di", "trang_thai": "du_thao", "loai": "Thông báo",
                        "trich_yeu": "Về lịch tiếp công dân", "noi_nhan": "Các thôn", "noi_dung": "Đoạn một.\nĐoạn hai."}
        self.patch_rong = False
        p = [mock.patch.object(main, "pgrst", self._pgrst), mock.patch.object(main, "s3_goi", self._s3),
             mock.patch.object(main.DICH_VU_TEP, "lay", return_value="tk-dv"),
             mock.patch.object(main, "chung_thu_ky", return_value={**CA, "ten": "UBND xã Thử – Bộ phận Một cửa"}),
             mock.patch.object(main.tep, "quet_clamav", return_value=(True, None)),
             mock.patch.object(main, "s3", return_value={"endpoint": "http://garage:3900", "region": "garage",
                                                         "accessKeyId": "GKthu", "secretAccessKey": "bi-mat-thu"}),
             mock.patch.object(ky_so, "html_sang_pdf", side_effect=self._gotenberg)]
        for x in p:
            x.start()
            self.addCleanup(x.stop)

    def _gotenberg(self, url, h):
        self.html.append(h)
        return pdf_toi_gian()

    def _pgrst(self, token, method, path, body=None, prefer=None):
        self.goi.append((method, path.split("?")[0], body))
        if path.startswith("/rpc/cap_so_van_ban_di"):
            return {"so": 7, "nam": 2026, "kyHieu": "7/TB-UBND", "ngayVanBan": "2026-10-23"}
        if method == "PATCH":
            return [] if self.patch_rong else [{**self.ban_ghi, **body, "so": 7, "ky_hieu": "7/TB-UBND"}]
        if method == "POST":
            return [{"id": VID, "so": 3, "nam": 2026, **body}]
        if "select=object_key" in path:
            return [{"object_key": "van-ban/di/2026/x.pdf", "loai_mime": "application/pdf", "ten_tep": "7-TB-UBND.pdf"}]
        return [self.ban_ghi]

    def _s3(self, method, key, du_lieu=b"", tieu_de=None):
        (self.luu.__setitem__(key, du_lieu) if method == "PUT" else self.xoa.append(key))
        return 200


class VaoSoDen(CoSo):
    def test_chi_van_thu(self):
        for vai in ("can_bo", "lanh_dao", "cong_dan"):
            with self.assertRaises(main.Loi) as e:
                main.vao_so_den("tk", claims(vai), Req(pdf_toi_gian(), DEN))
            self.assertEqual(e.exception.status, 403)

    def test_thieu_truong_hoac_ngay_sai(self):
        for sai in ({"trich_yeu": ""}, {"noi_gui": None}, {"ngay_van_ban": "20/10/2026"}):
            with self.assertRaises(main.Loi) as e:
                main.vao_so_den("tk", claims("van_thu"), Req(pdf_toi_gian(), {**DEN, **sai}))
            self.assertEqual(e.exception.status, 400, sai)
        self.assertEqual(self.luu, {})

    def test_ma_doc_khong_luu(self):
        with mock.patch.object(main.tep, "quet_clamav", return_value=(False, "Eicar-Test-Signature")):
            with self.assertRaises(main.Loi) as e:
                main.vao_so_den("tk", claims("van_thu"), Req(pdf_toi_gian(), DEN))
        self.assertEqual(e.exception.status, 422)
        self.assertEqual((self.luu, [g for g in self.goi if g[0] == "POST"]), ({}, []))

    def test_pdf_co_chu_ky_cua_xa_duoc_xac_minh_va_luu(self):
        da_ky = ky_so.ky_pdf(pdf_toi_gian(), CA, ly_do="x", noi_ky="y")
        status, dong = main.vao_so_den("tk", claims("van_thu", sub="sub-vt"), Req(da_ky, DEN))
        self.assertEqual(status, 201)
        (key, luu), = self.luu.items()
        self.assertRegex(key, r"^van-ban/den/\d{4}/[0-9a-f-]{36}\.pdf$")
        self.assertEqual(luu, da_ky)
        ghi = [g[2] for g in self.goi if g[0] == "POST"][0]
        self.assertEqual((ghi["chieu"], ghi["nguoi_tao_sub"], ghi["xac_minh_chu_ky"]["hopLe"]), ("den", "sub-vt", True))
        self.assertNotIn("so", ghi)  # số do CSDL cấp

    def test_pdf_khong_chu_ky(self):
        main.vao_so_den("tk", claims("van_thu"), Req(pdf_toi_gian(), DEN))
        ghi = [g[2] for g in self.goi if g[0] == "POST"][0]
        self.assertEqual((ghi["xac_minh_chu_ky"]["coChuKy"], ghi["xac_minh_chu_ky"]["hopLe"]), (False, False))


class DuThaoVaKy(CoSo):
    def test_du_thao_chi_van_thu_va_loai_ho_tro(self):
        with self.assertRaises(main.Loi) as e:
            main.du_thao_di("tk", claims("lanh_dao"), {"loai": "Thông báo", "trich_yeu": "x", "noi_nhan": "x", "noi_dung": "x"})
        self.assertEqual(e.exception.status, 403)
        with self.assertRaises(main.Loi) as e:
            main.du_thao_di("tk", claims("van_thu"), {"loai": "Thơ", "trich_yeu": "x", "noi_nhan": "x", "noi_dung": "x"})
        self.assertEqual(e.exception.status, 400)
        status, _ = main.du_thao_di("tk", claims("van_thu"), {"loai": "Thông báo", "trich_yeu": "x", "noi_nhan": "x",
                                                              "noi_dung": "x"})
        self.assertEqual(status, 201)

    def test_chi_lanh_dao_ky(self):
        for vai in ("van_thu", "can_bo"):
            with self.assertRaises(main.Loi) as e:
                main.ky_van_ban("tk", claims(vai), VID)
            self.assertEqual(e.exception.status, 403)

    def test_ky_cap_so_truoc_roi_in_so_vao_pdf_va_ky(self):
        status, kq = main.ky_van_ban("tk", claims("lanh_dao", sub="sub-ld", family_name="Lê", given_name="Văn Chủ Tịch"), VID)
        self.assertEqual(status, 200)
        thu_tu = [g[1] for g in self.goi if g[0] in ("POST", "PATCH")]
        self.assertEqual(thu_tu, ["/rpc/cap_so_van_ban_di", "/van_ban"])
        h = self.html[0]
        for co in ("Số: 7/TB-UBND", "THÔNG BÁO", "<p>Đoạn một.</p><p>Đoạn hai.</p>", "Lê Văn Chủ Tịch", "Xã Thử, ngày 23 tháng 10 năm 2026"):
            self.assertIn(co, h)
        (key, pdf), = self.luu.items()
        self.assertRegex(key, r"^van-ban/di/2026/[0-9a-f-]{36}\.pdf$")
        self.assertTrue(ky_so.xac_minh_pdf(pdf, CA["goc_pem"])["hopLe"])
        sua = [g[2] for g in self.goi if g[0] == "PATCH"][0]
        self.assertEqual((sua["trang_thai"], sua["nguoi_ky_sub"], sua["ten_tep"]), ("da_ky", "sub-ld", "7-TB-UBND.pdf"))
        self.assertIn("/files/s3/", kq["link"])

    def test_da_ky_thi_409(self):
        self.ban_ghi["trang_thai"] = "da_ky"
        with self.assertRaises(main.Loi) as e:
            main.ky_van_ban("tk", claims("lanh_dao"), VID)
        self.assertEqual(e.exception.status, 409)

    def test_loi_ky_giu_so_khong_ghi(self):
        with mock.patch.object(ky_so, "html_sang_pdf", side_effect=ky_so.LoiKySo("Gotenberg trả HTTP 503")):
            with self.assertRaises(main.Loi) as e:
                main.ky_van_ban("tk", claims("lanh_dao"), VID)
        self.assertEqual(e.exception.status, 503)
        self.assertEqual([g[1] for g in self.goi if g[0] in ("POST", "PATCH")], ["/rpc/cap_so_van_ban_di"])
        self.assertEqual(self.luu, {})

    def test_ky_trung_xoa_tep_vua_luu(self):
        self.patch_rong = True
        with self.assertRaises(main.Loi) as e:
            main.ky_van_ban("tk", claims("lanh_dao"), VID)
        self.assertEqual(e.exception.status, 409)
        self.assertEqual(self.xoa, list(self.luu))


if __name__ == "__main__":
    unittest.main()
