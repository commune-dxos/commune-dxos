# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Test bộ sinh dữ liệu mở (#102, scripts/xuat_du_lieu_mo.py): bản công bố trong repo khớp các gói; danh mục đúng
số thủ tục công khai, schema chép đúng từng byte và đúng SHA-256; CSV đủ dòng; thủ tục không công khai và gói lỗi
không được công bố; --kiem phát hiện tệp lệch, thiếu, thừa; ghi lại xóa tệp thừa, giữ README viết tay.
Chạy: python3 -m unittest discover -s scripts/tests"""

import csv
import hashlib
import io
import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import xuat_du_lieu_mo as x  # noqa: E402

GOC = x.GOC


class BanTrongRepo(unittest.TestCase):
    def setUp(self):
        self.tep = x.sinh()
        self.dm = json.loads(self.tep["danh-muc.json"])

    def test_khop_ban_cong_bo(self):
        self.assertEqual(x.so_sanh(self.tep, os.path.join(GOC, x.THU_MUC_RA)), [])

    def test_danh_muc_va_schema(self):
        goi = [t for t in sorted(os.listdir(os.path.join(GOC, "thu-tuc"))) if not t.startswith((".", "_"))]
        self.assertEqual(self.dm["so_thu_tuc"], len(goi))
        self.assertEqual(self.dm["giay_phep"], "CC-BY-4.0")
        for t in self.dm["thu_tuc"]:
            with open(os.path.join(GOC, t["goi"], "thanh-phan-ho-so.schema.json"), "rb") as f:
                goc = f.read()
            self.assertEqual(self.tep[t["schema"]], goc)
            self.assertEqual(t["schema_sha256"], hashlib.sha256(goc).hexdigest())
            self.assertEqual(t["cac_buoc"][0]["ma"], "tiep_nhan")
            self.assertTrue(any(b["nguoi_xu_ly"] == "lanh_dao" for b in t["cac_buoc"]))
        ks = next(t for t in self.dm["thu_tuc"] if t["ma"] == "KS01")
        self.assertIn({"ma": "bo_sung", "ten": "Công dân bổ sung hồ sơ", "nguoi_xu_ly": "nguoi_nop"}, ks["cac_buoc"])
        kh = next(t for t in self.dm["thu_tuc"] if t["ma"] == "KH01")
        self.assertEqual(next(p for p in kh["thanh_phan"] if p["ma"] == "giay_to_tuy_than")["so_tep_toi_thieu"], 2)

    def test_csv(self):
        dong = list(csv.DictReader(io.StringIO(self.tep["danh-muc.csv"].decode())))
        self.assertEqual([d["ma"] for d in dong], [t["ma"] for t in self.dm["thu_tuc"]])
        self.assertIn("Giấy tờ tùy thân của hai bên nam, nữ (2)", next(d for d in dong if d["ma"] == "KH01")["thanh_phan_bat_buoc"])

    def test_license_la_cc_by(self):
        self.assertTrue(self.tep["LICENSE"].startswith(b"Creative Commons Attribution 4.0 International"))

    def test_khong_doi_khi_chay_lai(self):
        self.assertEqual(x.sinh(), self.tep)


class GoiTam(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.td)
        shutil.copytree(os.path.join(GOC, "thu-tuc", "khai-sinh"), os.path.join(self.td, "thu-tuc", "khai-sinh"))
        shutil.copytree(os.path.join(GOC, "thu-tuc", "chung-thuc-ban-sao"),
                        os.path.join(self.td, "thu-tuc", "chung-thuc-ban-sao"))
        os.makedirs(os.path.join(self.td, "LICENSES"))
        shutil.copy(os.path.join(GOC, "LICENSES", "CC-BY-4.0.txt"), os.path.join(self.td, "LICENSES"))

    def sua(self, goi, tep, cu, moi):
        duong = os.path.join(self.td, "thu-tuc", goi, tep)
        with open(duong, encoding="utf-8") as f:
            s = f.read()
        with open(duong, "w", encoding="utf-8") as f:
            f.write(s.replace(cu, moi))

    def test_khong_cong_khai_thi_khong_cong_bo(self):
        self.sua("chung-thuc-ban-sao", "thu-tuc.yaml", "cong_khai: true", "cong_khai: false")
        dm = json.loads(x.sinh(self.td)["danh-muc.json"])
        self.assertEqual([t["ma"] for t in dm["thu_tuc"]], ["KS01"])

    def test_goi_loi_thi_dung(self):
        os.remove(os.path.join(self.td, "thu-tuc", "khai-sinh", "du-lieu-mau.json"))
        with self.assertRaisesRegex(ValueError, "khai-sinh"):
            x.sinh(self.td)

    def test_kiem_va_ghi(self):
        ra = os.path.join(self.td, "ra")
        tep = x.sinh(self.td)
        self.assertIn("thiếu danh-muc.json", x.so_sanh(tep, ra))
        x.ghi(tep, ra)
        with open(os.path.join(ra, "README.md"), "w") as f:
            f.write("viết tay")
        with open(os.path.join(ra, "schema", "CU.schema.json"), "w") as f:
            f.write("{}")
        self.assertEqual(x.so_sanh(tep, ra), ["thừa schema/CU.schema.json"])
        self.sua("khai-sinh", "thu-tuc.yaml", "thoi_han_ngay_lam_viec: 1", "thoi_han_ngay_lam_viec: 2")
        tep2 = x.sinh(self.td)
        self.assertIn("lệch danh-muc.json", x.so_sanh(tep2, ra))
        x.ghi(tep2, ra)
        self.assertEqual(x.so_sanh(tep2, ra), [])
        self.assertTrue(os.path.exists(os.path.join(ra, "README.md")))
        self.assertFalse(os.path.exists(os.path.join(ra, "schema", "CU.schema.json")))


if __name__ == "__main__":
    unittest.main()
