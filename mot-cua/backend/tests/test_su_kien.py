# SPDX-License-Identifier: Apache-2.0
"""Test đơn vị sự kiện hồ sơ (#9): su_kien.py (định dạng, ngày làm việc, sắp trễ hạn),
stomp.py (mã hóa/tách frame), worker.py (chống trùng sắp trễ hạn, consumer mẫu) với
PostgREST/Flowable/RabbitMQ giả. Thư viện chuẩn unittest, không cần Docker.

Chạy: make test   (hoặc python3 -m unittest discover -s mot-cua/backend/tests)
"""

import datetime
import logging
import json
import os
import sys
import unittest
import uuid
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import hop_thu  # noqa: E402
import stomp  # noqa: E402
import su_kien  # noqa: E402
import worker  # noqa: E402

logging.disable(logging.CRITICAL)  # log cảnh báo của worker không lẫn vào kết quả test
VN = su_kien.VN
HS = {"id": "7e570000-0000-4000-8000-000000000001", "ma_ho_so": "HS20261021-000001",
      "trang_thai": "moi", "han_xu_ly": "2026-10-23",
      "thu_tuc": {"ma": "KS01", "linh_vuc": {"ma": "ho_tich"}}}
D = datetime.date


def luc(y, m, d, h=9, mi=0):
    return datetime.datetime(y, m, d, h, mi, tzinfo=VN)


class TaoSuKien(unittest.TestCase):
    def test_du_truong_phien_ban_1(self):
        ev = su_kien.tao("ho_so.moi", HS, {"quyTrinh": "dang_ky_khai_sinh"}, luc=luc(2026, 10, 21, 8, 30))
        self.assertEqual(list(ev), list(su_kien.KHOA))
        self.assertEqual(ev["phienBan"], 1)
        self.assertEqual(ev["loai"], "ho_so.moi")
        self.assertEqual(ev["luc"], "2026-10-21T08:30:00+07:00")
        self.assertEqual((ev["hoSoId"], ev["maHoSo"], ev["linhVuc"], ev["thuTuc"]),
                         (HS["id"], "HS20261021-000001", "ho_tich", "KS01"))
        self.assertEqual(ev["nguon"], "mot-cua")
        self.assertEqual(str(uuid.UUID(ev["id"])), ev["id"])

    def test_id_moi_moi_lan_va_giu_khi_truyen(self):
        a, b = su_kien.tao("ho_so.moi", HS), su_kien.tao("ho_so.moi", HS)
        self.assertNotEqual(a["id"], b["id"])
        ma = "11111111-2222-4333-8444-555555555555"
        self.assertEqual(su_kien.tao("ho_so.moi", HS, ma=ma)["id"], ma)

    def test_doi_gio_utc_sang_gio_viet_nam(self):
        utc = datetime.datetime(2026, 10, 21, 20, 0, tzinfo=datetime.timezone.utc)
        self.assertEqual(su_kien.tao("ho_so.moi", HS, luc=utc)["luc"], "2026-10-22T03:00:00+07:00")

    def test_thieu_thu_tuc_thi_linh_vuc_null(self):
        ev = su_kien.tao("ho_so.moi", {"id": HS["id"], "ma_ho_so": "HS1"})
        self.assertIsNone(ev["linhVuc"])
        self.assertIsNone(ev["thuTuc"])

    def test_loai_la_bi_tu_choi(self):
        with self.assertRaises(ValueError):
            su_kien.tao("ho_so.xoa", HS)

    def test_khong_chua_du_lieu_ca_nhan(self):
        ev = su_kien.tao("ho_so.moi", {**HS, "ho_ten_nguoi_nop": "Nguyễn Văn A", "so_dien_thoai": "0900000000",
                                       "nguoi_nop_sub": "abc"})
        raw = json.dumps(ev, ensure_ascii=False)
        for gt in ("Nguyễn Văn A", "0900000000", "abc"):
            self.assertNotIn(gt, raw)
        for khoa in ("hoTen", "soDienThoai", "nguoiNopSub"):
            with self.assertRaises(ValueError):
                su_kien.tao("ho_so.moi", HS, {"a": [{khoa: "x"}]})

    def test_dong_hop_thu_va_nhat_ky(self):
        ev = su_kien.tao("ho_so.sap_tre_han", HS)
        d = su_kien.dong_hop_thu(ev, "k")
        self.assertEqual((d["id"], d["loai"], d["ho_so_id"], d["khoa_chong_trung"], d["noi_dung"]),
                         (ev["id"], "ho_so.sap_tre_han", HS["id"], "k", ev))
        n = su_kien.dong_nhat_ky(ev)
        self.assertEqual((n["su_kien_id"], n["ma_ho_so"], n["linh_vuc"], n["xay_ra_luc"]),
                         (ev["id"], HS["ma_ho_so"], "ho_tich", ev["luc"]))

    def test_dich_stomp(self):
        self.assertEqual(su_kien.dich("ho_so.moi"), "/exchange/mot_cua.su_kien/ho_so.moi")


class KiemSuKien(unittest.TestCase):
    def setUp(self):
        self.ev = su_kien.tao("ho_so.chuyen_buoc", HS, {"tuBuoc": "tiep_nhan"})

    def sai(self, **doi):
        ev = {**self.ev, **doi}
        with self.assertRaises(ValueError):
            su_kien.kiem(ev)

    def test_hop_le_qua_json(self):
        self.assertEqual(su_kien.giai_ma(json.dumps(self.ev).encode()), self.ev)

    def test_body_khong_phai_json(self):
        for body in (b"abc", b"\xff\xfe", b"[]", b"null"):
            with self.assertRaises(ValueError):
                su_kien.giai_ma(body)

    def test_cac_truong_hong(self):
        self.sai(phienBan=2)
        self.sai(phienBan=True)
        self.sai(id="khong-phai-uuid")
        self.sai(hoSoId=HS["id"].upper())
        self.sai(loai="khac")
        self.sai(maHoSo="")
        self.sai(luc="hôm qua")
        self.sai(luc="2026-10-21T08:00:00")  # thiếu múi giờ
        self.sai(duLieu=[])
        self.sai(linhVuc=1)

    def test_thieu_hoac_thua_khoa(self):
        ev = dict(self.ev)
        del ev["maHoSo"]
        with self.assertRaises(ValueError):
            su_kien.kiem(ev)
        with self.assertRaises(ValueError):
            su_kien.kiem({**self.ev, "hoTenNguoiNop": "A"})


class NgayLamViec(unittest.TestCase):
    # 23/10/2026 là thứ Sáu; 24, 25 là thứ Bảy, Chủ nhật.
    def test_cuoi_tuan(self):
        self.assertTrue(su_kien.la_ngay_lam_viec(D(2026, 10, 23), set()))
        self.assertFalse(su_kien.la_ngay_lam_viec(D(2026, 10, 24), set()))
        self.assertFalse(su_kien.la_ngay_lam_viec(D(2026, 10, 25), set()))

    def test_con_lai(self):
        f = su_kien.ngay_lam_viec_con_lai
        self.assertEqual(f(D(2026, 10, 21), D(2026, 10, 21)), 0)   # hạn hôm nay
        self.assertEqual(f(D(2026, 10, 21), D(2026, 10, 22)), 1)   # hạn ngày mai
        self.assertEqual(f(D(2026, 10, 23), D(2026, 10, 26)), 1)   # thứ Sáu → hạn thứ Hai
        self.assertEqual(f(D(2026, 10, 22), D(2026, 10, 26)), 2)   # thứ Năm → thứ Hai
        self.assertEqual(f(D(2026, 10, 24), D(2026, 10, 26)), 1)   # thứ Bảy → thứ Hai
        self.assertEqual(f(D(2026, 10, 21), D(2026, 10, 20)), -1)  # đã qua hạn

    def test_ngay_nghi_le(self):
        nghi = {D(2026, 10, 22)}
        self.assertEqual(su_kien.ngay_lam_viec_con_lai(D(2026, 10, 21), D(2026, 10, 23), nghi), 1)
        self.assertEqual(su_kien.ngay_lam_viec_con_lai(D(2026, 10, 21), D(2026, 10, 22), nghi), 0)


class SapTreHan(unittest.TestCase):
    def test_nguong_1_ngay_lam_viec(self):
        han = D(2026, 10, 23)  # thứ Sáu
        self.assertEqual(su_kien.sap_tre_han(han, luc(2026, 10, 21)), (False, 2))
        self.assertEqual(su_kien.sap_tre_han(han, luc(2026, 10, 22)), (True, 1))
        self.assertEqual(su_kien.sap_tre_han(han, luc(2026, 10, 23, 16, 59)), (True, 0))

    def test_qua_gio_het_han_thi_khong_canh_bao_sap_tre(self):
        han = D(2026, 10, 23)
        self.assertEqual(su_kien.sap_tre_han(han, luc(2026, 10, 23, 17, 0)), (False, -1))
        self.assertEqual(su_kien.sap_tre_han(han, luc(2026, 10, 26)), (False, -1))

    def test_cuoi_tuan_truoc_han_thu_hai(self):
        han = D(2026, 10, 26)  # thứ Hai
        self.assertEqual(su_kien.sap_tre_han(han, luc(2026, 10, 22)), (False, 2))
        self.assertEqual(su_kien.sap_tre_han(han, luc(2026, 10, 23)), (True, 1))
        self.assertEqual(su_kien.sap_tre_han(han, luc(2026, 10, 24)), (True, 1))

    def test_nguong_tuy_chinh_va_ngay_nghi(self):
        han = D(2026, 10, 27)
        self.assertEqual(su_kien.sap_tre_han(han, luc(2026, 10, 23), nguong=2), (True, 2))
        self.assertEqual(su_kien.sap_tre_han(han, luc(2026, 10, 23), {D(2026, 10, 26)}), (True, 1))

    def test_gio_utc(self):
        # 10:30 UTC ngày 23 = 17:30 giờ Việt Nam: đã quá giờ hết hạn của ngày 23.
        utc = datetime.datetime(2026, 10, 23, 10, 30, tzinfo=datetime.timezone.utc)
        self.assertEqual(su_kien.sap_tre_han(D(2026, 10, 23), utc), (False, -1))

    def test_khoa_chong_trung_theo_ho_so_va_han(self):
        k = su_kien.khoa_sap_tre_han(HS["id"], D(2026, 10, 23))
        self.assertEqual(k, f"ho_so.sap_tre_han:{HS['id']}:2026-10-23")
        self.assertEqual(k, su_kien.khoa_sap_tre_han(HS["id"], D(2026, 10, 23)))
        self.assertNotEqual(k, su_kien.khoa_sap_tre_han(HS["id"], D(2026, 10, 30)))


class Topology(unittest.TestCase):
    """definitions.json (rabbitmq-init nạp) khớp hằng số trong su_kien.py."""

    def setUp(self):
        with open(os.path.join(os.path.dirname(__file__), "..", "..", "rabbitmq", "definitions.json"),
                  encoding="utf-8") as f:
            self.defs = json.load(f)

    def test_chi_khai_topology(self):
        self.assertLessEqual(set(self.defs), {"exchanges", "queues", "bindings"})

    def test_exchange_queue_va_binding(self):
        ex = {e["name"]: e for e in self.defs["exchanges"]}
        q = {e["name"]: e for e in self.defs["queues"]}
        self.assertEqual(ex[su_kien.EXCHANGE]["type"], "topic")
        self.assertTrue(ex[su_kien.EXCHANGE]["durable"] and q[su_kien.QUEUE_NHAT_KY]["durable"])
        dlx = q[su_kien.QUEUE_NHAT_KY]["arguments"]["x-dead-letter-exchange"]
        self.assertIn(dlx, ex)
        rk = [b["routing_key"] for b in self.defs["bindings"]
              if b["source"] == su_kien.EXCHANGE and b["destination"] == su_kien.QUEUE_NHAT_KY]
        # Mọi loại sự kiện đều tới queue nhật ký (topic: ho_so.# khớp ho_so.<bất kỳ>).
        self.assertEqual(rk, ["ho_so.#"])
        self.assertTrue(all(loai.startswith("ho_so.") for loai in su_kien.LOAI))
        self.assertTrue(any(b["source"] == dlx for b in self.defs["bindings"]))


class Stomp(unittest.TestCase):
    def test_ma_hoa_va_tach_frame(self):
        raw = stomp.ma_hoa("SEND", {"destination": "/exchange/x/ho_so.moi", "a:b": "c\nd"}, '{"ở":1}')
        self.assertTrue(raw.endswith(b"\x00"))
        self.assertIn(b"a\\cb:c\\nd", raw)
        bd = stomp.BoDoc()
        # Hai frame liền nhau, có heart-beat, nhận từng mẩu một.
        luong = b"\n" + raw + b"\r\n" + stomp.ma_hoa("RECEIPT", {"receipt-id": "r-1"})
        for i in range(0, len(luong), 7):
            bd.nap(luong[i:i + 7])
        lenh, h, body = bd.lay()
        self.assertEqual((lenh, h["destination"], h["a:b"], json.loads(body)), ("SEND", "/exchange/x/ho_so.moi",
                                                                                 "c\nd", {"ở": 1}))
        self.assertEqual(bd.lay()[:2], ("RECEIPT", {"receipt-id": "r-1"}))
        self.assertIsNone(bd.lay())

    def test_body_co_nul_dung_content_length(self):
        bd = stomp.BoDoc()
        bd.nap(stomp.ma_hoa("MESSAGE", {"ack": "1"}, b"a\x00b"))
        self.assertEqual(bd.lay()[2], b"a\x00b")

    def test_chua_du_frame(self):
        bd = stomp.BoDoc()
        raw = stomp.ma_hoa("MESSAGE", {"ack": "1"}, b"abc")
        bd.nap(raw[:-2])
        self.assertIsNone(bd.lay())
        bd.nap(raw[-2:])
        self.assertEqual(bd.lay()[2], b"abc")

    def test_connect_khong_escape(self):
        self.assertIn(b"passcode:a:b\n", stomp.ma_hoa("CONNECT", {"passcode": "a:b"}))

    def test_escape_sai(self):
        with self.assertRaises(stomp.LoiStomp):
            stomp.bo_thoat("a\\tb")


class QuetSapTreHan(unittest.TestCase):
    """worker.quet_mot_lan với CSDL/Flowable giả: chống trùng theo khóa như ràng buộc UNIQUE."""

    def setUp(self):
        self.da_ghi, self.khoa = [], set()
        hs_khac = {**HS, "id": "7e570000-0000-4000-8000-000000000002", "ma_ho_so": "HS2", "han_xu_ly": "2026-10-30"}
        hs_xong = {**HS, "id": "7e570000-0000-4000-8000-000000000003", "ma_ho_so": "HS3"}
        self.ds = [HS, hs_khac, hs_xong]

        def pgrst(method, path, body=None, prefer=None):
            return [] if path.startswith("/ngay_nghi") else self.ds

        def flowable(path):
            if "businessKey=HS3" in path:  # quy trình đã kết thúc
                return {"data": []}
            if path.startswith("/runtime/tasks"):
                return {"data": [{"taskDefinitionKey": "tham_dinh"}]}
            return {"data": [{"id": "pi-1"}]}

        def ghi(loai, ho_so_id, du_lieu=None, khoa_chong_trung=None, ho_so=None):
            if khoa_chong_trung in self.khoa:
                return None
            self.khoa.add(khoa_chong_trung)
            ev = su_kien.tao(loai, ho_so, du_lieu)
            self.da_ghi.append(ev)
            return ev

        self.p = [mock.patch.object(hop_thu, "pgrst", pgrst), mock.patch.object(worker, "flowable", flowable),
                  mock.patch.object(hop_thu, "ghi", ghi)]
        for p in self.p:
            p.start()

    def tearDown(self):
        for p in self.p:
            p.stop()

    def test_mot_lan_cho_moi_ho_so_va_han(self):
        self.assertEqual(worker.quet_mot_lan(luc(2026, 10, 22)), 1)
        ev = self.da_ghi[0]
        self.assertEqual((ev["loai"], ev["maHoSo"]), ("ho_so.sap_tre_han", HS["ma_ho_so"]))
        self.assertEqual(ev["duLieu"]["conLaiNgayLamViec"], 1)
        self.assertEqual(ev["duLieu"]["hanXuLy"], "2026-10-23")
        self.assertEqual(ev["duLieu"]["buocDangMo"], ["tham_dinh"])
        # Quét lại (cùng ngày, hôm sau): không phát trùng.
        self.assertEqual(worker.quet_mot_lan(luc(2026, 10, 22, 15)), 0)
        self.assertEqual(worker.quet_mot_lan(luc(2026, 10, 23, 8)), 0)
        self.assertEqual(len(self.da_ghi), 1)

    def test_gia_han_thi_canh_bao_lai(self):
        worker.quet_mot_lan(luc(2026, 10, 22))
        HS_GIA_HAN = {**HS, "han_xu_ly": "2026-10-27"}
        self.ds = [HS_GIA_HAN]
        self.assertEqual(worker.quet_mot_lan(luc(2026, 10, 26)), 1)

    def test_chua_toi_nguong_hoac_qua_han_thi_khong(self):
        self.assertEqual(worker.quet_mot_lan(luc(2026, 10, 20)), 0)
        self.assertEqual(worker.quet_mot_lan(luc(2026, 10, 23, 18)), 0)


class ConsumerMau(unittest.TestCase):
    def setUp(self):
        self.kn = mock.Mock()

    def test_hop_le_ghi_roi_ack(self):
        ev = su_kien.tao("ho_so.moi", HS)
        with mock.patch.object(hop_thu, "ghi_nhat_ky", return_value=True) as g:
            self.assertTrue(worker.xu_ly_tin(self.kn, {"ack": "a1"}, json.dumps(ev).encode()))
        g.assert_called_once_with(ev)
        self.kn.ack.assert_called_once_with("a1")
        self.kn.nack.assert_not_called()

    def test_sai_dinh_dang_thi_nack(self):
        with mock.patch.object(hop_thu, "ghi_nhat_ky") as g:
            self.assertFalse(worker.xu_ly_tin(self.kn, {"ack": "a2"}, b'{"loai":"x"}'))
        g.assert_not_called()
        self.kn.nack.assert_called_once_with("a2")
        self.kn.ack.assert_not_called()

    def test_loi_csdl_thi_khong_ack(self):
        ev = su_kien.tao("ho_so.moi", HS)
        with mock.patch.object(hop_thu, "ghi_nhat_ky", side_effect=hop_thu.LoiHopThu("PostgREST 503")):
            with self.assertRaises(hop_thu.LoiHopThu):
                worker.xu_ly_tin(self.kn, {"ack": "a3"}, json.dumps(ev).encode())
        self.kn.ack.assert_not_called()
        self.kn.nack.assert_not_called()


class PhatOutbox(unittest.TestCase):
    def test_receipt_roi_moi_danh_dau_da_phat(self):
        ev = su_kien.tao("ho_so.moi", HS)
        kn = mock.Mock()
        with mock.patch.object(hop_thu, "chua_phat", return_value=[
                {"id": ev["id"], "loai": ev["loai"], "noi_dung": ev, "so_lan_thu": 0}]), \
                mock.patch.object(hop_thu, "da_phat") as dp:
            self.assertEqual(worker.phat_mot_vong(kn), (kn, 1))
        dich, body, h = kn.phat.call_args.args
        self.assertEqual((dich, json.loads(body), h["amqp-message-id"]), (su_kien.dich("ho_so.moi"), ev, ev["id"]))
        dp.assert_called_once_with(ev["id"])

    def test_broker_loi_thi_giu_lai_trong_hop_thu(self):
        ev = su_kien.tao("ho_so.moi", HS)
        kn = mock.Mock()
        kn.phat.side_effect = stomp.LoiStomp("broker đóng kết nối")
        with mock.patch.object(hop_thu, "chua_phat", return_value=[
                {"id": ev["id"], "loai": ev["loai"], "noi_dung": ev, "so_lan_thu": 2}]), \
                mock.patch.object(hop_thu, "da_phat") as dp, mock.patch.object(hop_thu, "phat_loi") as pl:
            with self.assertRaises(stomp.LoiStomp):
                worker.phat_mot_vong(kn)
        dp.assert_not_called()
        self.assertEqual(pl.call_args.args[:2], (ev["id"], 3))


if __name__ == "__main__":
    unittest.main()
