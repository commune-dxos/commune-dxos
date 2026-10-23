# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Test trình xác minh độc lập nhật ký kiểm toán (#75): kiem_toan.py dựng lại nội dung chuẩn đúng như
PostgreSQL (vector dùng chung với db/tests/kiem_toan.sql), phát hiện sửa, tính lại băm, xóa giữa/cuối
chuỗi, mốc sai, đọc theo trang qua API (giả). Không cần Docker.

Chạy: make test-backend
"""

import contextlib
import decimal
import io
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import kiem_toan  # noqa: E402

# Cùng bản ghi với mục 5 của db/tests/kiem_toan.sql; PostgreSQL ra đúng văn bản và băm này.
VECTOR = {
    "stt": 7, "luc": "2026-10-23T15:01:02.5+07:00", "hanh_dong": "ho_so.chuyen_trang_thai", "doi_tuong": "ho_so",
    "doi_tuong_id": "7e573000-0000-4000-8000-000000000001", "nguoi_sub": "sub-cán-bộ", "vai_tro": "can_bo",
    "nguon": "api",
    "du_lieu": json.loads('{"lyDo": "Thiếu \\"bản sao\\"\\nkèm\\ttab \\\\ và \\u0001", "cot": ["so_dien_thoai", "ly_do"],'
                          ' "so": 12, "tien": 1.50, "dung": true, "rong": null, "z": {"bb": 1, "a": [], "ă": {}}}',
                          parse_float=decimal.Decimal),
}
NOI_DUNG = ('{"luc": "2026-10-23T08:01:02.500000Z", "stt": 7, "nguon": "api", "duLieu": {"z": {"a": [], "bb": 1, '
            '"ă": {}}, "so": 12, "cot": ["so_dien_thoai", "ly_do"], "dung": true, "lyDo": "Thiếu \\"bản sao\\"\\nkèm'
            '\\ttab \\\\ và \\u0001", "rong": null, "tien": 1.50}, "vaiTro": "can_bo", "doiTuong": "ho_so", '
            '"hanhDong": "ho_so.chuyen_trang_thai", "nguoiSub": "sub-cán-bộ", '
            '"doiTuongId": "7e573000-0000-4000-8000-000000000001"}')
BAM = "51ee137008169a66cfcada10f14bf59813a10507940727cde4a862deb3b75499"


def chuoi(n):
    """n bản ghi hợp lệ nối nhau, luc như PostgREST trả (UTC, phần lẻ giây bỏ số 0 cuối)."""
    ds, truoc = [], kiem_toan.BAM_GOC
    for i in range(1, n + 1):
        b = {"stt": i, "luc": f"2026-10-23T01:00:{i % 60:02d}.12+00:00", "hanh_dong": "ho_so.nop", "doi_tuong": "ho_so",
             "doi_tuong_id": f"hs-{i}", "nguoi_sub": None, "vai_tro": "cong_dan", "nguon": "nop",
             "du_lieu": {"maHoSo": f"HS{i:06d}", "so": i}, "bam_truoc": truoc}
        b["bam"] = kiem_toan.bam(truoc, b)
        ds.append(b)
        truoc = b["bam"]
    return ds


def dau(ds):
    return {"stt": ds[-1]["stt"], "bam": ds[-1]["bam"]}


def loi(kq):
    return None if kq["hopLe"] else f"{kq['loi']['loai']}@{kq['loi']['stt']}"


class NoiDungChuan(unittest.TestCase):
    def test_vector_khop_postgresql(self):
        self.assertEqual(kiem_toan.noi_dung(VECTOR), NOI_DUNG)
        self.assertEqual(kiem_toan.bam("a" * 64, VECTOR), BAM)

    def test_khoa_sap_theo_do_dai_byte_roi_theo_byte(self):
        self.assertEqual(kiem_toan.van_ban_jsonb({"ă": 1, "bb": 2, "a": 3, "c": 4}), '{"a": 3, "c": 4, "bb": 2, "ă": 1}')

    def test_luc_doi_sang_utc_micro_giay(self):
        self.assertEqual(kiem_toan.luc_utc("2026-10-23T07:00:00+07:00"), "2026-10-23T00:00:00.000000Z")
        self.assertEqual(kiem_toan.luc_utc("2026-10-23T00:00:00.123456Z"), "2026-10-23T00:00:00.123456Z")
        with self.assertRaises(ValueError):
            kiem_toan.luc_utc("2026-10-23T00:00:00")

    def test_so_thuc_phai_doc_bang_decimal(self):
        with self.assertRaises(ValueError):
            kiem_toan.van_ban_jsonb({"x": 1.5})


class XacMinh(unittest.TestCase):
    def setUp(self):
        self.ds = chuoi(6)

    def test_chuoi_hop_le(self):
        kq = kiem_toan.xac_minh(self.ds, dau(self.ds))
        self.assertTrue(kq["hopLe"])
        self.assertEqual((kq["soBanGhi"], kq["bamCuoi"]), (6, self.ds[-1]["bam"]))

    def test_chuoi_rong(self):
        self.assertTrue(kiem_toan.xac_minh([], {"stt": 0, "bam": kiem_toan.BAM_GOC})["hopLe"])

    def test_sua_noi_dung(self):
        self.ds[2]["du_lieu"]["maHoSo"] = "HS999999"
        self.assertEqual(loi(kiem_toan.xac_minh(self.ds, dau(self.ds))), "noi_dung_bi_sua@3")

    def test_sua_roi_tinh_lai_bam(self):
        self.ds[2]["nguoi_sub"] = "nguoi-khac"
        self.ds[2]["bam"] = kiem_toan.bam(self.ds[2]["bam_truoc"], self.ds[2])
        self.assertEqual(loi(kiem_toan.xac_minh(self.ds, dau(self.ds))), "lien_ket_dut@4")

    def test_xoa_giua_chuoi(self):
        d = dau(self.ds)
        del self.ds[3]
        self.assertEqual(loi(kiem_toan.xac_minh(self.ds, d)), "thieu_ban_ghi@4")

    def test_xoa_ban_ghi_cuoi(self):
        d = dau(self.ds)
        self.ds.pop()
        self.assertEqual(loi(kiem_toan.xac_minh(self.ds, d)), "dau_chuoi_lech@6")

    def test_moc(self):
        b = self.ds[1]["bam"]
        self.assertTrue(kiem_toan.xac_minh(self.ds, dau(self.ds), (2, b))["hopLe"])
        self.assertEqual(loi(kiem_toan.xac_minh(self.ds, dau(self.ds), (2, "f" * 64))), "moc_khong_khop@2")
        self.assertEqual(loi(kiem_toan.xac_minh(self.ds, dau(self.ds), (99, b))), "moc_khong_khop@99")


class QuaApi(unittest.TestCase):
    def test_doc_theo_trang(self):
        ds = chuoi(5)
        goi = []

        def get(url, token):
            goi.append(url)
            self.assertEqual(token, "tk")
            if "/dau_chuoi_kiem_toan" in url:
                return [dau(ds)]
            tu = int(url.split("stt=gt.")[1].split("&")[0])
            return [b for b in ds if b["stt"] > tu][:kiem_toan.TRANG]

        with mock.patch.object(kiem_toan, "TRANG", 2), mock.patch.object(kiem_toan, "_get", get):
            kq = kiem_toan.xac_minh_qua_api("http://gw/api/", "tk")
        self.assertTrue(kq["hopLe"])
        self.assertEqual(kq["soBanGhi"], 5)
        self.assertEqual(len(goi), 4)  # đầu chuỗi + 3 trang (2, 2, 1)

    def test_khong_doc_duoc_dau_chuoi(self):
        with mock.patch.object(kiem_toan, "_get", lambda url, token: []):
            with self.assertRaises(ValueError):
                kiem_toan.xac_minh_qua_api("http://gw/api", "tk")


class DongLenh(unittest.TestCase):
    def _chay(self, ds, *tham_so):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
            json.dump(ds, f, ensure_ascii=False)
        self.addCleanup(os.unlink, f.name)
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            ma = kiem_toan.main(["--tep", f.name, *tham_so])
        return ma, json.loads(out.getvalue())

    def test_tep_hop_le_va_khong_hop_le(self):
        ds = chuoi(3)
        ma, kq = self._chay(ds, "--dau-chuoi", json.dumps(dau(ds)), "--moc", f"1:{ds[0]['bam']}")
        self.assertEqual((ma, kq["hopLe"]), (0, True))
        ds[1]["vai_tro"] = "lanh_dao"
        ma, kq = self._chay(ds)
        self.assertEqual((ma, kq["loi"]["stt"]), (1, 2))

    def test_thieu_token(self):
        with mock.patch.dict(os.environ, {"DXOS_TOKEN": ""}), contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                kiem_toan.main(["--api", "http://gw/api"])


if __name__ == "__main__":
    unittest.main()
