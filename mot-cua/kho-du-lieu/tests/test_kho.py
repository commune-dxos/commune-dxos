# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Test đầu cuối của kho dữ liệu (#80) trên dữ liệu mẫu giả du-lieu-mau.json, không cần lõi: xuất
Parquet (không cột cá nhân, phân vùng tháng/thủ tục, chạy lại ra đúng các tệp cũ), dbt build + docs
generate, mart có đúng số liệu tính tay. Cần duckdb, dbt-core, dbt-duckdb (requirements.txt cạnh
chay.py): make test-kho, CI job kho-du-lieu.

Số liệu mẫu (giờ Việt Nam; ngày nghỉ 01, 02/09/2026):
  HSMAU-001 KS01 nộp 28/09 08:00, hạn 01/10, xong 30/09 10:00        → 2 ngày làm việc, đúng hạn
  HSMAU-002 KS01 nộp 29/09 09:00, hạn 02/10, xong 02/10 17:30, bổ sung 1 lần → trễ hạn (sau 17:00)
  HSMAU-003 CT01 nộp 05/10 08:00, hạn 05/10, xong 05/10 14:00        → 0 ngày, đúng hạn
  HSMAU-004 CT01 nộp 06/10 08:00, hạn 06/10, từ chối 07/10 09:00     → trễ hạn
  HSMAU-005 KS01 nộp 31/08 08:00, hạn 04/09, xong 04/09 16:00        → 2 ngày (bỏ 01, 02/09), đúng hạn
"""

import json
import os
import sys
import tempfile
import unittest

THU_MUC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, THU_MUC)
os.environ.setdefault("DBT_SEND_ANONYMOUS_USAGE_STATS", "false")

import chay  # noqa: E402

MAU = os.path.join(THU_MUC, "du-lieu-mau.json")


class KhoDuLieu(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.kho = cls.tmp.name
        assert chay.main(["--mau", MAU, "--kho", cls.kho, "--khong-nap"]) == 0
        with open(os.path.join(cls.kho, "parquet", "_manifest.json"), encoding="utf-8") as f:
            cls.manifest = json.load(f)
        cls.mart = chay.doc_mart(cls.kho)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_phan_vung_va_so_dong(self):
        self.assertEqual(self.manifest["bang"], {"ho_so": 5, "lich_su_trang_thai": 17, "ngay_nghi": 2})
        duong = {t["duong"] for t in self.manifest["tep"]}
        self.assertIn("ho_so/thang=2026-10/thu_tuc=CT01/du_lieu_0.parquet", duong)
        self.assertIn("ho_so/thang=2026-09/thu_tuc=KS01/du_lieu_0.parquet", duong)
        self.assertIn("ngay_nghi/du_lieu.parquet", duong)

    def test_parquet_khong_co_cot_ca_nhan(self):
        import duckdb
        cot = {r[0] for r in duckdb.sql(
            f"DESCRIBE SELECT * FROM read_parquet('{self.kho}/parquet/*/**/*.parquet', union_by_name = true)").fetchall()}
        self.assertFalse(cot & {"ho_ten_nguoi_nop", "so_dien_thoai", "nguoi_nop_sub", "nguoi_sub", "ly_do"}, cot)
        self.assertIn("ho_so_id", cot)

    def test_xuat_lai_ra_dung_tep_cu(self):
        chay.main(["--mau", MAU, "--kho", self.kho, "--chi-xuat"])
        with open(os.path.join(self.kho, "parquet", "_manifest.json"), encoding="utf-8") as f:
            self.assertEqual(json.load(f), self.manifest)
        self.assertEqual([t for t in os.listdir(self.kho) if t.startswith(".parquet")], [])

    def test_fct_ho_so(self):
        theo_ma = {r["ma_ho_so"]: r for r in self.mart["fct_ho_so"]}
        self.assertEqual({m: (r["so_ngay_lam_viec"], r["tre_han"], r["so_lan_bo_sung"]) for m, r in theo_ma.items()}, {
            "HSMAU-001": (2, False, 0), "HSMAU-002": (3, True, 1), "HSMAU-003": (0, False, 0),
            "HSMAU-004": (1, True, 0), "HSMAU-005": (2, False, 0)})
        self.assertEqual(theo_ma["HSMAU-002"]["thang"], "2026-10-01")
        self.assertEqual(theo_ma["HSMAU-003"]["so_gio_giai_quyet"], 6.0)

    def test_hieu_suat_thang(self):
        gon = {(r["thang"], r["thu_tuc"]): (r["so_ho_so"], r["so_hoan_tat"], r["so_tu_choi"], r["so_tre_han"],
                                           r["ty_le_tre_han"]) for r in self.mart["hieu_suat_thang"]}
        self.assertEqual(gon, {
            ("2026-09-01", "KS01"): (2, 2, 0, 0, 0.0),
            ("2026-10-01", "KS01"): (1, 1, 0, 1, 1.0),
            ("2026-10-01", "CT01"): (2, 1, 1, 1, 0.5)})

    def test_lineage_docs(self):
        with open(os.path.join(self.kho, "dbt-target", "manifest.json"), encoding="utf-8") as f:
            m = json.load(f)
        cha = m["parent_map"]["model.kho_mot_cua.hieu_suat_thang"]
        self.assertEqual(cha, ["model.kho_mot_cua.fct_ho_so"])
        self.assertTrue(os.path.exists(os.path.join(self.kho, "dbt-target", "catalog.json")))
        with open(os.path.join(self.kho, "dbt-target", "run_results_build.json"), encoding="utf-8") as f:
            rr = json.load(f)
        self.assertEqual({r["status"] for r in rr["results"]}, {"pass", "success"})
        self.assertGreaterEqual(sum(r["unique_id"].startswith("test.") for r in rr["results"]), 40)


if __name__ == "__main__":
    unittest.main()
