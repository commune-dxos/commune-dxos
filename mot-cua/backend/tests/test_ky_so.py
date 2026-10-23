# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Test giấy tờ có ký số (#77): ky_so.py (mẫu HTML thoát ký tự, multipart cho Gotenberg, ký PAdES rồi
xác minh bằng pyHanko: hợp lệ; sửa 1 byte → không toàn vẹn; CA khác → không tin cậy; thêm nội dung sau
khi ký → không phủ toàn bộ; không chữ ký, không phải PDF) và luồng phát hành của main.py (Gotenberg,
OpenBao, PostgREST, Garage là đối tượng giả). CA thử sinh trong test bằng cryptography, không cần
step-ca hay Docker.

Chạy: make test-backend
"""

import datetime
import hashlib
import io
import os
import sys
import unittest
from unittest import mock

os.environ.setdefault("DXOS_JWT_ISSUER", "http://localhost:8080/realms/dxos")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cryptography import x509  # noqa: E402
from cryptography.hazmat.primitives import hashes, serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402
from cryptography.x509.oid import NameOID  # noqa: E402

import ky_so  # noqa: E402
import main  # noqa: E402


def _pem(cert):
    return cert.public_bytes(serialization.Encoding.PEM).decode()


def _cert(ten, khoa, ca=None, ca_khoa=None, la_ca=False):
    now = datetime.datetime.now(datetime.timezone.utc)
    ten_x509 = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, ten), x509.NameAttribute(NameOID.COUNTRY_NAME, "VN")])
    b = (x509.CertificateBuilder().subject_name(ten_x509).issuer_name(ca.subject if ca else ten_x509)
         .public_key(khoa.public_key()).serial_number(x509.random_serial_number())
         .not_valid_before(now - datetime.timedelta(days=1)).not_valid_after(now + datetime.timedelta(days=365))
         .add_extension(x509.BasicConstraints(ca=la_ca, path_length=None), critical=True)
         .add_extension(x509.KeyUsage(digital_signature=not la_ca, content_commitment=not la_ca, key_encipherment=False,
                                      data_encipherment=False, key_agreement=False, key_cert_sign=la_ca, crl_sign=la_ca,
                                      encipher_only=False, decipher_only=False), critical=True))
    return b.sign(ca_khoa or khoa, hashes.SHA256())


def tao_ca(ten_ca="CA thử"):
    """Root + intermediate + chứng thư ký tài liệu, dạng dict như ca-init ghi vào OpenBao."""
    k_goc, k_tg, k_ky = (rsa.generate_private_key(public_exponent=65537, key_size=2048) for _ in range(3))
    goc = _cert(ten_ca, k_goc, la_ca=True)
    tg = _cert(ten_ca + " trung gian", k_tg, goc, k_goc, la_ca=True)
    ky = _cert("UBND xã Thử – Một cửa", k_ky, tg, k_tg)
    return {"khoa_pem": k_ky.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL,
                                           serialization.NoEncryption()).decode(),
            "chung_thu_pem": _pem(ky) + _pem(tg), "goc_pem": _pem(goc), "ten": "UBND xã Thử – Một cửa",
            "so_hieu": str(ky.serial_number)}


def pdf_toi_gian():
    """PDF một trang trống hợp lệ (bảng xref đúng), đủ để ký."""
    doi_tuong = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
                 b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>"]
    out = io.BytesIO()
    out.write(b"%PDF-1.7\n")
    vi_tri = []
    for i, o in enumerate(doi_tuong, 1):
        vi_tri.append(out.tell())
        out.write(b"%d 0 obj\n" % i + o + b"\nendobj\n")
    xref = out.tell()
    out.write(b"xref\n0 %d\n0000000000 65535 f \n" % (len(doi_tuong) + 1))
    for v in vi_tri:
        out.write(b"%010d 00000 n \n" % v)
    out.write(b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(doi_tuong) + 1, xref))
    return out.getvalue()


CA = tao_ca()


class MauHtml(unittest.TestCase):
    DU_LIEU = {"co_quan": "UBND xã Thử", "ma_ho_so": "HS20261023-000001", "nguoi_nop": "Nguyễn <b>Thử</b> & con",
               "thu_tuc": "Đăng ký khai sinh", "ma_thu_tuc": "KS01", "ngay_nhan": "08:00 23/10/2026",
               "han_xu_ly": "26/10/2026", "thanh_phan": ["Tờ khai", "Giấy chứng sinh"], "le_phi": "Miễn lệ phí",
               "ngay_lap": "08:01 23/10/2026"}

    def test_thoat_html_va_danh_sach(self):
        h = ky_so.dung_html("bien_nhan", self.DU_LIEU)
        self.assertIn("Nguyễn &lt;b&gt;Thử&lt;/b&gt; &amp; con", h)
        self.assertNotIn("<b>Thử</b>", h)
        self.assertIn("<li>Tờ khai</li><li>Giấy chứng sinh</li>", h)
        self.assertIn("HS20261023-000001", h)

    def test_mau_tu_chua_khong_tai_tu_mang(self):
        for loai in ky_so.LOAI:
            with open(os.path.join(ky_so.THU_MUC_MAU, f"{loai}.html"), encoding="utf-8") as f:
                noi_dung = f.read().lower()
            for cam in ("http://", "https://", "<script", "@import", "src="):
                self.assertNotIn(cam, noi_dung, f"{loai}.html chứa {cam}")

    def test_thieu_bien_va_loai_la(self):
        with self.assertRaises(KeyError):
            ky_so.dung_html("ket_qua", self.DU_LIEU)  # thiếu ngay_hoan_tat, ket_qua
        with self.assertRaises(ValueError):
            ky_so.dung_html("../../etc/passwd", self.DU_LIEU)

    def test_ngay_vn(self):
        self.assertEqual(ky_so.ngay_vn("2026-10-23"), "23/10/2026")
        self.assertEqual(ky_so.ngay_vn("2026-10-23T01:30:00+00:00"), "08:30 23/10/2026")
        self.assertEqual(ky_so.ngay_vn(None), "")

    def test_multipart_cho_gotenberg(self):
        body, loai = ky_so._multipart({"paperWidth": "8.27"}, {"index.html": (b"<p>a</p>", "text/html")})
        ranh_gioi = loai.split("boundary=")[1]
        self.assertTrue(body.endswith(f"--{ranh_gioi}--\r\n".encode()))
        self.assertIn(b'name="paperWidth"\r\n\r\n8.27\r\n', body)
        self.assertIn(b'name="files"; filename="index.html"\r\nContent-Type: text/html\r\n\r\n<p>a</p>\r\n', body)


class KyVaXacMinh(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.da_ky = ky_so.ky_pdf(pdf_toi_gian(), CA, ly_do="Biên nhận hồ sơ HS1", noi_ky=CA["ten"])

    def test_ky_roi_xac_minh_hop_le(self):
        kq = ky_so.xac_minh_pdf(self.da_ky, CA["goc_pem"])
        self.assertTrue(kq["hopLe"], kq)
        self.assertEqual((kq["toanVen"], kq["chuKyDung"], kq["tinCay"], kq["phuToanBo"]), (True, True, True, True))
        self.assertEqual(kq["nguoiKy"], "UBND xã Thử – Một cửa")
        self.assertEqual(kq["soHieuChungThu"], CA["so_hieu"])
        self.assertEqual(kq["sha256"], hashlib.sha256(self.da_ky).hexdigest())
        self.assertIsNotNone(kq["kyLuc"])

    def test_sua_mot_byte_thi_khong_toan_ven(self):
        i = self.da_ky.index(b"/MediaBox [0 0 595 842]")
        sua = self.da_ky[:i] + b"/MediaBox [0 0 595 843]" + self.da_ky[i + 23:]
        self.assertEqual(len(sua), len(self.da_ky))
        kq = ky_so.xac_minh_pdf(sua, CA["goc_pem"])
        self.assertFalse(kq["hopLe"])
        self.assertFalse(kq["toanVen"])
        self.assertEqual(kq["loi"], "Nội dung đã bị sửa sau khi ký")

    def test_ca_khac_thi_khong_tin_cay(self):
        kq = ky_so.xac_minh_pdf(self.da_ky, tao_ca("CA lạ")["goc_pem"])
        self.assertFalse(kq["hopLe"])
        self.assertTrue(kq["toanVen"])
        self.assertFalse(kq["tinCay"])

    def test_them_noi_dung_sau_khi_ky(self):
        from pyhanko.pdf_utils.generic import NameObject, NumberObject
        from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
        w = IncrementalPdfFileWriter(io.BytesIO(self.da_ky))
        trang = w.root["/Pages"]["/Kids"][0].get_object()
        trang[NameObject("/Rotate")] = NumberObject(90)
        w.update_container(trang)
        out = io.BytesIO()
        w.write(out)
        kq = ky_so.xac_minh_pdf(out.getvalue(), CA["goc_pem"])
        self.assertFalse(kq["hopLe"])
        self.assertTrue(kq["toanVen"])  # phần đã ký còn nguyên, nhưng có phần thêm sau
        self.assertFalse(kq["phuToanBo"])

    def test_khong_chu_ky_va_khong_phai_pdf(self):
        kq = ky_so.xac_minh_pdf(pdf_toi_gian(), CA["goc_pem"])
        self.assertEqual((kq["hopLe"], kq["coChuKy"], kq["loi"]), (False, False, "PDF không có chữ ký số"))
        kq = ky_so.xac_minh_pdf(b"khong phai pdf", CA["goc_pem"])
        self.assertEqual((kq["hopLe"], kq["loi"]), (False, "Không đọc được tệp PDF"))

    def test_khoa_hong(self):
        with self.assertRaises(ky_so.LoiKySo):
            ky_so.ky_pdf(pdf_toi_gian(), {**CA, "khoa_pem": "hỏng"}, ly_do="x", noi_ky="y")


class PhatHanh(unittest.TestCase):
    """main.phat_hanh: sinh → ký → Garage → giay_to_ky; có rồi thì trả lại; kết quả chỉ khi hoàn tất."""

    HS = {"id": "11111111-1111-4111-8111-111111111111", "ma_ho_so": "HS20261023-000001", "trang_thai": "dang_xu_ly",
          "ho_ten_nguoi_nop": "Nguyễn Thử", "ngay_nhan": "2026-10-23T01:00:00+00:00", "han_xu_ly": "2026-10-26",
          "ngay_hoan_tat": None, "thu_tuc": {"ma": "KS01", "ten": "Đăng ký khai sinh", "le_phi": 0}}

    def setUp(self):
        self.da_luu, self.da_ghi, self.co_san = {}, [], []
        p = [mock.patch.object(main, "pgrst", self._pgrst), mock.patch.object(main, "s3_goi", self._s3),
             mock.patch.object(main.DICH_VU_TEP, "lay", return_value="tk-dv"),
             mock.patch.object(main, "chung_thu_ky", return_value=CA),
             mock.patch.object(ky_so, "html_sang_pdf", side_effect=lambda url, h: pdf_toi_gian())]
        for x in p:
            x.start()
            self.addCleanup(x.stop)

    def _pgrst(self, token, method, path, body=None, prefer=None):
        self.assertEqual(token, "tk-dv")
        if path.startswith("/giay_to_ky") and method == "GET":
            return list(self.co_san)
        if path.startswith("/ho_so"):
            return [self.HS]
        if path.startswith("/thanh_phan_ho_so"):
            return [{"ten_tep": "to-khai.pdf", "thanh_phan_yeu_cau": {"ten": "Tờ khai"}}]
        if path.startswith("/giay_to_ky") and method == "POST":
            self.da_ghi.append(body)
            return [{"id": "22222222-2222-4222-8222-222222222222", **body}]
        raise AssertionError(path)

    def _s3(self, method, key, du_lieu=b"", tieu_de=None):
        self.da_luu[key] = du_lieu
        return 200

    def test_phat_hanh_bien_nhan_ky_va_luu(self):
        dong, moi = main.phat_hanh(self.HS["id"], "bien_nhan", "sub-cd")
        self.assertTrue(moi)
        (key, pdf), = self.da_luu.items()
        self.assertRegex(key, rf"^ho-so/{self.HS['id']}/giay-to/bien_nhan-[0-9a-f-]{{36}}\.pdf$")
        ghi = self.da_ghi[0]
        self.assertEqual((ghi["sha256"], ghi["kich_thuoc"], ghi["nguoi_yeu_cau_sub"]),
                         (hashlib.sha256(pdf).hexdigest(), len(pdf), "sub-cd"))
        self.assertEqual(ghi["chung_thu_so_hieu"], CA["so_hieu"])
        self.assertTrue(ky_so.xac_minh_pdf(pdf, CA["goc_pem"])["hopLe"])

    def test_co_roi_thi_khong_sinh_lai(self):
        self.co_san.append({"id": "x", "loai": "bien_nhan"})
        self.assertEqual(main.phat_hanh(self.HS["id"], "bien_nhan", "s"), ({"id": "x", "loai": "bien_nhan"}, False))
        self.assertEqual(self.da_luu, {})

    def test_ket_qua_chi_khi_hoan_tat(self):
        with self.assertRaises(main.Loi) as e:
            main.phat_hanh(self.HS["id"], "ket_qua", "s")
        self.assertEqual(e.exception.status, 409)
        with mock.patch.dict(self.HS, {"trang_thai": "hoan_tat", "ngay_hoan_tat": "2026-10-24T02:00:00+00:00"}):
            _, moi = main.phat_hanh(self.HS["id"], "ket_qua", "s")
        self.assertTrue(moi)

    def test_gotenberg_loi_thi_503_khong_luu(self):
        with mock.patch.object(ky_so, "html_sang_pdf", side_effect=ky_so.LoiKySo("Gotenberg trả HTTP 503")):
            with self.assertRaises(main.Loi) as e:
                main.phat_hanh(self.HS["id"], "bien_nhan", "s")
        self.assertEqual(e.exception.status, 503)
        self.assertEqual((self.da_luu, self.da_ghi), ({}, []))


if __name__ == "__main__":
    unittest.main()
