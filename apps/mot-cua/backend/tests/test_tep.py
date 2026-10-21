# SPDX-License-Identifier: Apache-2.0
"""Test đơn vị của apps/mot-cua/backend/tep.py (thư viện chuẩn unittest, không cần Docker).

Chạy: make test   (hoặc python3 -m unittest discover -s apps/mot-cua/backend/tests)
"""

import datetime
import os
import socket
import struct
import sys
import threading
import unittest
import urllib.parse

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import tep  # noqa: E402
from tep import LoiTep  # noqa: E402

PDF = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n"
PNG = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
JPG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00"


class KiemTenTep(unittest.TestCase):
    def test_duoi_hop_le(self):
        self.assertEqual(tep.kiem_ten_tep("to-khai.pdf"), ("to-khai.pdf", "pdf"))
        self.assertEqual(tep.kiem_ten_tep("  Ảnh CCCD.JPG "), ("Ảnh CCCD.JPG", "jpg"))
        self.assertEqual(tep.kiem_ten_tep("a.jpeg")[1], "jpeg")
        self.assertEqual(tep.kiem_ten_tep("scan.Png")[1], "png")

    def test_duoi_khong_nhan_415(self):
        for ten in ("virus.exe", "giay.docx", "a.pdf.exe", "khong-duoi", "trang.html", "a.svg"):
            with self.subTest(ten=ten), self.assertRaises(LoiTep) as e:
                tep.kiem_ten_tep(ten)
            self.assertEqual(e.exception.status, 415)

    def test_ten_xau_400(self):
        for ten in (None, "", "   ", "../../etc/passwd.pdf", "a\\b.pdf", ".pdf", "a\x00.pdf",
                    "a‮gpj.pdf", "x" * 252 + ".pdf"):
            with self.subTest(ten=ten), self.assertRaises(LoiTep) as e:
                tep.kiem_ten_tep(ten)
            self.assertEqual(e.exception.status, 400)

    def test_content_type_phai_khop_duoi(self):
        self.assertEqual(tep.kiem_loai_khai_bao("pdf", "application/pdf"), "application/pdf")
        self.assertEqual(tep.kiem_loai_khai_bao("jpeg", "image/JPEG; charset=binary"), "image/jpeg")
        for duoi, ct in (("pdf", "image/png"), ("png", None), ("jpg", "application/octet-stream")):
            with self.subTest(duoi=duoi, ct=ct), self.assertRaises(LoiTep) as e:
                tep.kiem_loai_khai_bao(duoi, ct)
            self.assertEqual(e.exception.status, 415)


class KiemMagic(unittest.TestCase):
    def test_nhan_dien(self):
        self.assertEqual(tep.nhan_dien(PDF), "pdf")
        self.assertEqual(tep.nhan_dien(PNG), "png")
        self.assertEqual(tep.nhan_dien(JPG), "jpg")
        self.assertIsNone(tep.nhan_dien(b"MZ\x90\x00 exe"))
        self.assertIsNone(tep.nhan_dien(b""))

    def test_dung_loai(self):
        tep.kiem_magic("pdf", PDF)
        tep.kiem_magic("png", PNG)
        tep.kiem_magic("jpg", JPG)
        tep.kiem_magic("jpeg", JPG)

    def test_gia_mao_415(self):
        for duoi, du_lieu in (("pdf", b"<html><script>alert(1)</script>"), ("pdf", PNG),
                              ("png", JPG), ("jpg", PDF), ("pdf", b" %PDF-1.7"), ("pdf", b"")):
            with self.subTest(duoi=duoi, dau=du_lieu[:8]), self.assertRaises(LoiTep) as e:
                tep.kiem_magic(duoi, du_lieu)
            self.assertEqual(e.exception.status, 415)


class QuyTacQuyen(unittest.TestCase):
    HS = {"nguoi_nop_sub": "cd-x", "trang_thai": "moi"}

    def ma(self, ham, *args):
        try:
            ham(*args)
            return 200
        except LoiTep as e:
            return e.status

    def test_tai_len(self):
        q = tep.kiem_quyen_tai_len
        self.assertEqual(self.ma(q, "cong_dan", "cd-x", self.HS), 200)
        self.assertEqual(self.ma(q, "cong_dan", "cd-x", {**self.HS, "trang_thai": "cho_bo_sung"}), 200)
        self.assertEqual(self.ma(q, "can_bo", "cb", self.HS), 403)
        self.assertEqual(self.ma(q, "lanh_dao", "ld", self.HS), 403)
        self.assertEqual(self.ma(q, None, "x", self.HS), 403)
        self.assertEqual(self.ma(q, "cong_dan", "cd-y", self.HS), 403)
        self.assertEqual(self.ma(q, "cong_dan", "cd-x", None), 404)
        for tt in ("dang_xu_ly", "hoan_tat", "tu_choi"):
            self.assertEqual(self.ma(q, "cong_dan", "cd-x", {**self.HS, "trang_thai": tt}), 409, tt)

    def test_xem(self):
        q = tep.kiem_quyen_xem
        for vai in ("cong_dan", "can_bo", "lanh_dao"):
            self.assertEqual(self.ma(q, vai, True, True), 200, vai)
            self.assertEqual(self.ma(q, vai, False, True), 403, vai)  # vd. cán bộ sai lĩnh vực
            self.assertEqual(self.ma(q, vai, False, False), 404, vai)
        self.assertEqual(self.ma(q, "dich_vu_tep", True, True), 403)
        self.assertEqual(self.ma(q, None, True, True), 403)


class KySigV4(unittest.TestCase):
    # Ví dụ chính thức của AWS: "Authenticating Requests: Using Query Parameters (AWS Signature Version 4)".
    ACCESS = "AKIAIOSFODNN7EXAMPLE"
    SECRET = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
    LUC = datetime.datetime(2013, 5, 24, tzinfo=datetime.timezone.utc)

    def test_presign_vi_du_aws(self):
        url = tep.presign("GET", "https://examplebucket.s3.amazonaws.com/test.txt", "us-east-1",
                          self.ACCESS, self.SECRET, 86400, luc=self.LUC)
        q = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(url).query))
        self.assertEqual(q["X-Amz-Signature"], "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404")
        self.assertEqual(q["X-Amz-Credential"], "AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request")
        self.assertEqual(q["X-Amz-SignedHeaders"], "host")

    def test_header_vi_du_aws(self):
        # Ví dụ GET Object có Range trong "Signature Calculations for the Authorization Header".
        h = tep.ky_header("GET", "https://examplebucket.s3.amazonaws.com/test.txt", "us-east-1",
                          self.ACCESS, self.SECRET,
                          "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                          {"Range": "bytes=0-9"}, luc=self.LUC)
        self.assertTrue(h["Authorization"].endswith(
            "SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,"
            " Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41"), h["Authorization"])

    def test_presign_doi_tham_so_thi_doi_chu_ky(self):
        a = tep.presign("GET", "http://garage:3900/b/ho-so/x.pdf", "garage", "GK1", "s", 60, luc=self.LUC)
        b = tep.presign("GET", "http://garage:3900/b/ho-so/x.pdf", "garage", "GK1", "s", 61, luc=self.LUC)
        c = tep.presign("GET", "http://garage:3900/b/ho-so/x.pdf", "garage", "GK1", "s", 60, luc=self.LUC,
                        query_them={"response-content-type": "application/pdf"})
        ky = [dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(u).query))["X-Amz-Signature"] for u in (a, b, c)]
        self.assertEqual(len(set(ky)), 3)
        d = tep.presign("GET", "http://garage:3900/b/k", "garage", "GK1", "bi-mat-khong-lo", 60)
        self.assertNotIn("bi-mat-khong-lo", d)  # secret không bao giờ nằm trong URL

    def test_presign_gioi_han_thoi_gian(self):
        for giay in (0, -1, 604801):
            with self.subTest(giay=giay), self.assertRaises(ValueError):
                tep.presign("GET", "http://garage:3900/b/k", "garage", "GK1", "s", giay)

    def test_content_disposition(self):
        cd = tep.content_disposition('Giấy "khai" sinh.pdf')
        self.assertTrue(cd.startswith('inline; filename="Gi_y _khai_ sinh.pdf"; filename*=UTF-8\'\''))
        self.assertIn("Gi%E1%BA%A5y%20%22khai%22%20sinh.pdf", cd)


class Clamd(unittest.TestCase):
    def test_doc_ket_qua(self):
        self.assertEqual(tep.doc_ket_qua_quet("stream: OK"), (True, None))
        self.assertEqual(tep.doc_ket_qua_quet("stream: Eicar-Test-Signature FOUND"), (False, "Eicar-Test-Signature"))
        for tra in ("INSTREAM size limit exceeded. ERROR", "", "stream: lỗi lạ ERROR"):
            with self.subTest(tra=tra), self.assertRaises(LoiTep) as e:
                tep.doc_ket_qua_quet(tra)
            self.assertEqual(e.exception.status, 503)

    def test_khong_ket_noi_duoc_503(self):
        s = socket.socket()
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
        s.close()  # cổng vừa đóng: không ai nghe
        with self.assertRaises(LoiTep) as e:
            tep.quet_clamav("127.0.0.1", port, PDF, timeout=2)
        self.assertEqual(e.exception.status, 503)

    def test_giao_thuc_instream(self):
        """clamd giả: kiểm khung INSTREAM (độ dài 4 byte big-endian, kết thúc bằng 0)."""
        nhan = {}
        srv = socket.socket()
        srv.bind(("127.0.0.1", 0))
        srv.listen(1)

        def phuc_vu():
            c, _ = srv.accept()
            with c, c.makefile("rb") as f:
                lenh = b""
                while not lenh.endswith(b"\0"):
                    lenh += f.read(1)
                du_lieu = b""
                while True:
                    (n,) = struct.unpack(">I", f.read(4))
                    if n == 0:
                        break
                    du_lieu += f.read(n)
                nhan.update(lenh=lenh, du_lieu=du_lieu)
                c.sendall(b"stream: Win.Test.EICAR_HDB-1 FOUND\0" if b"EICAR" in du_lieu else b"stream: OK\0")

        for du_lieu, mong_doi in ((PDF * 5000, (True, None)), (b"%PDF-EICAR", (False, "Win.Test.EICAR_HDB-1"))):
            t = threading.Thread(target=phuc_vu)
            t.start()
            self.assertEqual(tep.quet_clamav("127.0.0.1", srv.getsockname()[1], du_lieu, timeout=5), mong_doi)
            t.join()
            self.assertEqual(nhan["lenh"], b"zINSTREAM\0")
            self.assertEqual(nhan["du_lieu"], du_lieu)
        srv.close()


if __name__ == "__main__":
    unittest.main()
