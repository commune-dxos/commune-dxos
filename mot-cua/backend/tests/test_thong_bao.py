# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Test đơn vị thông báo sắp trễ hạn tới cán bộ (#56): consumer thông báo của worker.py (ACK/NACK, kênh
giả lập) với PostgREST/RabbitMQ giả, cấu hình kênh, luồng SSE của chuông (thong_bao.py) và quyền vào luồng
ở main.py. Thư viện chuẩn unittest, không cần Docker.
"""

import json
import logging
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import hop_thu  # noqa: E402
import su_kien  # noqa: E402
import thong_bao  # noqa: E402
import worker  # noqa: E402

logging.disable(logging.CRITICAL)
HS = {"id": "7e560000-0000-4000-8000-000000000001", "ma_ho_so": "HS20261024-000056",
      "trang_thai": "dang_xu_ly", "han_xu_ly": "2026-10-27",
      "thu_tuc": {"ma": "KS01", "linh_vuc": {"ma": "ho_tich"}}}


def sap_tre():
    return su_kien.tao("ho_so.sap_tre_han", HS, {"hanXuLy": "2026-10-27", "conLaiNgayLamViec": 1})


class KenhThongBao(unittest.TestCase):
    def test_doc_cau_hinh(self):
        self.assertEqual(su_kien.kenh_thong_bao("email,sms"), ("email", "sms"))
        self.assertEqual(su_kien.kenh_thong_bao(" SMS , sms,,email "), ("sms", "email"))
        self.assertEqual(su_kien.kenh_thong_bao(""), ())
        self.assertEqual(su_kien.kenh_thong_bao(None), ())

    def test_kenh_la_bao_loi(self):
        with self.assertRaises(ValueError):
            su_kien.kenh_thong_bao("email,zalo")


class ConsumerThongBao(unittest.TestCase):
    def setUp(self):
        self.kn = mock.Mock()

    def test_sap_tre_han_ghi_roi_ack_kem_kenh(self):
        ev = sap_tre()
        with mock.patch.object(hop_thu, "ghi_thong_bao", return_value={"moi": 2, "nguoiNhan": 2}) as g:
            self.assertEqual(worker.xu_ly_thong_bao(self.kn, {"ack": "a1"}, json.dumps(ev).encode(), ("email",)), 2)
        g.assert_called_once_with(ev, ("email",))
        self.kn.ack.assert_called_once_with("a1")
        self.kn.nack.assert_not_called()

    def test_nhan_lai_khong_them_van_ack(self):
        with mock.patch.object(hop_thu, "ghi_thong_bao", return_value={"moi": 0, "nguoiNhan": 2}):
            self.assertEqual(worker.xu_ly_thong_bao(self.kn, {"ack": "a2"}, json.dumps(sap_tre()).encode(), ()), 0)
        self.kn.ack.assert_called_once_with("a2")

    def test_sai_loai_hay_sai_dinh_dang_thi_nack_khong_goi_csdl(self):
        for body in (json.dumps(su_kien.tao("ho_so.moi", HS)).encode(), b'{"loai":"ho_so.sap_tre_han"}', b"x"):
            kn = mock.Mock()
            with mock.patch.object(hop_thu, "ghi_thong_bao") as g:
                self.assertEqual(worker.xu_ly_thong_bao(kn, {"ack": "a3"}, body, ()), 0)
            g.assert_not_called()
            kn.nack.assert_called_once_with("a3")
            kn.ack.assert_not_called()

    def test_csdl_tu_choi_du_lieu_thi_nack(self):
        with mock.patch.object(hop_thu, "ghi_thong_bao", side_effect=hop_thu.LoiHopThu("PostgREST 400", 400)):
            self.assertEqual(worker.xu_ly_thong_bao(self.kn, {"ack": "a4"}, json.dumps(sap_tre()).encode(), ()), 0)
        self.kn.nack.assert_called_once_with("a4")

    def test_loi_tam_thoi_thi_khong_ack_de_giao_lai(self):
        with mock.patch.object(hop_thu, "ghi_thong_bao", side_effect=hop_thu.LoiHopThu("PostgREST 503", 503)):
            with self.assertRaises(hop_thu.LoiHopThu):
                worker.xu_ly_thong_bao(self.kn, {"ack": "a5"}, json.dumps(sap_tre()).encode(), ())
        self.kn.ack.assert_not_called()
        self.kn.nack.assert_not_called()

    def test_rpc_gui_dung_tham_so(self):
        ev = sap_tre()
        with mock.patch.object(hop_thu, "pgrst", return_value={"moi": 1, "nguoiNhan": 1}) as p:
            self.assertEqual(hop_thu.ghi_thong_bao(ev, ("email", "sms")), {"moi": 1, "nguoiNhan": 1})
        p.assert_called_once_with("POST", "/rpc/ghi_thong_bao_sap_tre", {"p_su_kien": ev, "p_kenh": ["email", "sms"]})


class LuongSse(unittest.TestCase):
    def test_khung_sse(self):
        self.assertEqual(thong_bao.khung("thong-bao", {"chuaDoc": 1, "moiNhat": "x"}),
                         b'event: thong-bao\ndata: {"chuaDoc":1,"moiNhat":"x"}\n\n')
        self.assertEqual(thong_bao.trang_thai([]), {"chuaDoc": 0, "moiNhat": None})
        self.assertEqual(thong_bao.trang_thai([{"id": "b"}, {"id": "a"}]), {"chuaDoc": 2, "moiNhat": "b"})

    def test_day_khi_doi_nhip_khi_im_dung_khi_het_han(self):
        dong_ho = {"t": 0.0}
        trang = iter([{"chuaDoc": 0, "moiNhat": None}] * 3 + [{"chuaDoc": 1, "moiNhat": "t1"}] * 10)
        da_gui = []

        def ngu(s):
            dong_ho["t"] += s

        n = thong_bao.theo_doi(lambda: next(trang), da_gui.append, het_han_luc=40, bay_gio=lambda: dong_ho["t"],
                               ngu=ngu, chu_ky=5, nhip_giay=15)
        su_kien_gui = [b.split(b"\n")[0] for b in da_gui]
        self.assertEqual(su_kien_gui[0], b"event: thong-bao")
        self.assertIn(b'"chuaDoc":1', da_gui[su_kien_gui.index(b"event: thong-bao", 1)])
        self.assertIn(b": nhip", su_kien_gui)
        self.assertEqual(da_gui[-1], b"event: het-han\ndata: {}\n\n")
        self.assertEqual(n, 3)

    def test_trinh_duyet_dong_thi_dung(self):
        def gui(_):
            raise BrokenPipeError

        with self.assertRaises(BrokenPipeError):
            thong_bao.theo_doi(lambda: {"chuaDoc": 0}, gui, het_han_luc=1e12, ngu=lambda s: None)


if __name__ == "__main__":
    unittest.main()
