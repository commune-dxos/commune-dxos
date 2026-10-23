# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Giấy tờ có ký số của bộ máy một cửa (#77): biên nhận hồ sơ, thông báo kết quả.

  dung_html(loai, du_lieu)      mẫu mot-cua/mau-giay-to/<loai>.html + dữ liệu (đã thoát HTML)
  html_sang_pdf(url, html)      Gotenberg (Chromium) → PDF; mẫu tự chứa, không tải gì từ mạng
  ky_pdf(pdf, ky_so, …)         pyHanko ký PAdES B-B bằng chứng thư ca-init ghi vào OpenBao
  xac_minh_pdf(pdf, goc_pem)    pyHanko kiểm chữ ký: toàn vẹn, đúng chữ ký, tin cậy theo root CA
                                của xã, phủ toàn bộ tệp (không có phần thêm sau khi ký)

ky_so là dict bí mật dxos/tang2/<DXOS_TANG2>/ky-so: khoa_pem, chung_thu_pem (chứng thư + intermediate),
goc_pem (root CA), ten, so_hieu, het_han. pyHanko (MIT) chỉ nạp khi ký/xác minh.
"""

import datetime
import hashlib
import html
import io
import logging
import os
import string
import urllib.error
import urllib.request
import uuid

LOAI = {
    "bien_nhan": "Biên nhận hồ sơ",
    "ket_qua": "Thông báo kết quả giải quyết hồ sơ",
}
THU_MUC_MAU = os.environ.get("DXOS_MAU_GIAY_TO", os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                                              "..", "mau-giay-to"))
VN = datetime.timezone(datetime.timedelta(hours=7))
TRUONG_KY = "KySoCoQuan"
# pyHanko ghi traceback cho mọi chữ ký không hợp lệ (PDF bị sửa, CA lạ): đó là kết quả xác minh bình
# thường, đã trả cho người gọi, không phải lỗi của dịch vụ.
for _ten in ("pyhanko", "pyhanko_certvalidator"):
    logging.getLogger(_ten).setLevel(logging.CRITICAL)


class LoiKySo(Exception):
    """Không sinh, ký hay đọc được giấy tờ (thông điệp không chứa bí mật)."""


# --- Mẫu HTML --------------------------------------------------------------------------
def dung_html(loai, du_lieu):
    """Thay $bien trong mẫu bằng giá trị đã thoát HTML; giá trị dạng list → các dòng <li>.
    Thiếu biến trong du_lieu → KeyError (mẫu và mã phải khớp)."""
    if loai not in LOAI:
        raise ValueError(f"loại giấy tờ không hỗ trợ: {loai}")
    with open(os.path.join(THU_MUC_MAU, f"{loai}.html"), encoding="utf-8") as f:
        mau = string.Template(f.read())
    gia_tri = {}
    for k, v in du_lieu.items():
        if isinstance(v, (list, tuple)):
            gia_tri[k] = "".join(f"<li>{html.escape(str(x))}</li>" for x in v) or "<li>(không có)</li>"
        else:
            gia_tri[k] = html.escape("" if v is None else str(v))
    return mau.substitute(gia_tri)


def ngay_vn(gia_tri):
    """ISO 8601 (date hoặc timestamptz) → 'dd/mm/yyyy' hoặc 'HH:MM dd/mm/yyyy' giờ Việt Nam."""
    if not gia_tri:
        return ""
    if len(gia_tri) == 10:
        return datetime.date.fromisoformat(gia_tri).strftime("%d/%m/%Y")
    t = datetime.datetime.fromisoformat(gia_tri.replace("Z", "+00:00")).astimezone(VN)
    return t.strftime("%H:%M %d/%m/%Y")


# --- Gotenberg -------------------------------------------------------------------------
def _multipart(truong, tep):
    """Trường form {tên: giá trị} + tệp {tên tệp: (bytes, content-type)} → (body, content-type)."""
    ranh_gioi = uuid.uuid4().hex
    phan = [f"--{ranh_gioi}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
            for k, v in truong.items()]
    for ten, (noi_dung, loai) in tep.items():
        phan.append(f"--{ranh_gioi}\r\nContent-Disposition: form-data; name=\"files\"; filename=\"{ten}\"\r\n"
                    f"Content-Type: {loai}\r\n\r\n".encode() + noi_dung + b"\r\n")
    return b"".join(phan) + f"--{ranh_gioi}--\r\n".encode(), f"multipart/form-data; boundary={ranh_gioi}"


def html_sang_pdf(url, html_vb, timeout=40):
    """POST /forms/chromium/convert/html: khổ A4, in nền, không lề của trình duyệt (mẫu tự đặt lề)."""
    body, loai = _multipart(
        {"paperWidth": "8.27", "paperHeight": "11.7", "marginTop": "0", "marginBottom": "0",
         "marginLeft": "0", "marginRight": "0", "printBackground": "true"},
        {"index.html": (html_vb.encode("utf-8"), "text/html; charset=utf-8")})
    req = urllib.request.Request(url.rstrip("/") + "/forms/chromium/convert/html", data=body, method="POST",
                                 headers={"Content-Type": loai})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            pdf = r.read()
    except urllib.error.HTTPError as e:
        raise LoiKySo(f"Gotenberg trả HTTP {e.code}") from None
    except (urllib.error.URLError, TimeoutError) as e:
        raise LoiKySo(f"không gọi được Gotenberg: {e}") from None
    if not pdf.startswith(b"%PDF-"):
        raise LoiKySo("Gotenberg không trả PDF")
    return pdf


# --- Ký và xác minh (pyHanko) ---------------------------------------------------------------
def _chung_thu(pem):
    from asn1crypto import pem as asn1_pem, x509
    return [x509.Certificate.load(der) for _, _, der in asn1_pem.unarmor(pem.encode(), multiple=True)]


def ky_pdf(pdf, ky_so, ly_do, noi_ky):
    """PDF → PDF đã ký PAdES B-B (một chữ ký ẩn phủ toàn bộ tệp, nhúng chuỗi chứng thư tới root)."""
    from asn1crypto import keys
    from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
    from pyhanko.sign import fields, signers
    from pyhanko_certvalidator.registry import SimpleCertificateStore
    from cryptography.hazmat.primitives import serialization

    try:
        chuoi = _chung_thu(ky_so["chung_thu_pem"])
        goc = _chung_thu(ky_so["goc_pem"])
        khoa = serialization.load_pem_private_key(ky_so["khoa_pem"].encode(), password=None)
        khoa_asn1 = keys.PrivateKeyInfo.load(khoa.private_bytes(
            serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    except (KeyError, ValueError, TypeError) as e:
        raise LoiKySo(f"chứng thư ký số không hợp lệ: {type(e).__name__}") from None
    nguoi_ky = signers.SimpleSigner(signing_cert=chuoi[0], signing_key=khoa_asn1,
                                    cert_registry=SimpleCertificateStore.from_certs(chuoi[1:] + goc))
    meta = signers.PdfSignatureMetadata(field_name=TRUONG_KY, reason=ly_do, location=noi_ky,
                                        subfilter=fields.SigSeedSubFilter.PADES, md_algorithm="sha256")
    try:
        return signers.sign_pdf(IncrementalPdfFileWriter(io.BytesIO(pdf)), meta, signer=nguoi_ky).getvalue()
    except Exception as e:  # noqa: BLE001 – lỗi pyHanko đủ loại, không lộ chi tiết nội bộ
        raise LoiKySo(f"không ký được PDF: {type(e).__name__}") from None


def xac_minh_pdf(pdf, goc_pem):
    """→ dict kết quả. Không ném lỗi với PDF hỏng/không chữ ký: trả hopLe False kèm loi."""
    from pyhanko.pdf_utils.reader import PdfFileReader
    from pyhanko.sign.validation import validate_pdf_signature
    from pyhanko.sign.validation.status import SignatureCoverageLevel
    from pyhanko_certvalidator import ValidationContext

    kq = {"hopLe": False, "coChuKy": False, "sha256": hashlib.sha256(pdf).hexdigest()}
    try:
        ds = PdfFileReader(io.BytesIO(pdf), strict=False).embedded_signatures
    except Exception:  # noqa: BLE001
        return {**kq, "loi": "Không đọc được tệp PDF"}
    if not ds:
        return {**kq, "loi": "PDF không có chữ ký số"}
    chu_ky = ds[-1]  # chữ ký sau cùng phải phủ toàn bộ tệp
    try:
        st = validate_pdf_signature(chu_ky, ValidationContext(trust_roots=_chung_thu(goc_pem)))
    except Exception as e:  # noqa: BLE001
        return {**kq, "coChuKy": True, "loi": f"Không kiểm được chữ ký: {type(e).__name__}"}
    phu_het = st.coverage == SignatureCoverageLevel.ENTIRE_FILE
    kq.update({
        "coChuKy": True, "soChuKy": len(ds),
        "toanVen": bool(st.intact), "chuKyDung": bool(st.valid), "tinCay": bool(st.trusted), "phuToanBo": phu_het,
        "nguoiKy": st.signing_cert.subject.native.get("common_name"),
        "soHieuChungThu": format(st.signing_cert.serial_number, "d"),
        "kyLuc": st.signer_reported_dt.isoformat() if st.signer_reported_dt else None,
    })
    kq["hopLe"] = kq["toanVen"] and kq["chuKyDung"] and kq["tinCay"] and phu_het
    if not kq["hopLe"]:
        kq["loi"] = ("Nội dung đã bị sửa sau khi ký" if not st.intact
                     else "Chữ ký không đúng" if not st.valid
                     else "Chứng thư không thuộc CA của xã" if not st.trusted
                     else "Có nội dung thêm vào sau khi ký")
    return kq
