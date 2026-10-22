# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Phần thuần của API tệp mot-cua (#7): kiểm tệp, ký S3 SigV4, quét clamd, quy tắc quyền.

Không đọc biến môi trường, không gọi PostgREST: main.py ghép các hàm này vào luồng HTTP,
mot-cua/backend/tests/ kiểm riêng từng hàm. Chỉ dùng thư viện chuẩn Python.
"""

import datetime
import hashlib
import hmac
import socket
import struct
import unicodedata
import urllib.parse


class LoiTep(Exception):
    def __init__(self, status, thong_diep, chi_tiet=None):
        super().__init__(thong_diep)
        self.status, self.thong_diep, self.chi_tiet = status, thong_diep, chi_tiet


# --- Loại tệp được nhận -----------------------------------------------------------------
# Đuôi → (MIME duy nhất được chấp nhận, chữ ký đầu tệp). Đuôi, Content-Type khai báo và
# nội dung thật phải khớp nhau; bất kỳ chỗ nào lệch → 415.
LOAI_TEP = {
    "pdf": ("application/pdf", (b"%PDF-",)),
    "png": ("image/png", (b"\x89PNG\r\n\x1a\n",)),
    "jpg": ("image/jpeg", (b"\xff\xd8\xff",)),
    "jpeg": ("image/jpeg", (b"\xff\xd8\xff",)),
}


def kiem_ten_tep(ten):
    """→ (tên đã chuẩn hóa NFC, đuôi viết thường). Tên lạ → 400, đuôi không nhận → 415."""
    if not isinstance(ten, str):
        raise LoiTep(400, "Thiếu tên tệp (tham số ten)")
    ten = unicodedata.normalize("NFC", ten.strip())
    if not 1 <= len(ten) <= 255:
        raise LoiTep(400, "Tên tệp phải dài 1–255 ký tự")
    if any(unicodedata.category(c) in ("Cc", "Cf") for c in ten) or "/" in ten or "\\" in ten or ten.startswith("."):
        raise LoiTep(400, "Tên tệp chứa ký tự không hợp lệ")
    duoi = ten.rsplit(".", 1)[1].lower() if "." in ten else ""
    if duoi not in LOAI_TEP:
        raise LoiTep(415, "Chỉ nhận tệp PDF, JPG, PNG", {"nhan": sorted(LOAI_TEP)})
    return ten, duoi


def kiem_loai_khai_bao(duoi, content_type):
    """Content-Type của request phải đúng MIME của đuôi tệp → MIME."""
    mime = LOAI_TEP[duoi][0]
    khai_bao = (content_type or "").split(";", 1)[0].strip().lower()
    if khai_bao != mime:
        raise LoiTep(415, f"Content-Type phải là {mime} cho tệp .{duoi}")
    return mime


def nhan_dien(du_lieu):
    """Loại tệp theo chữ ký đầu tệp (magic bytes) → đuôi chuẩn hoặc None."""
    for duoi in ("pdf", "png", "jpg"):
        if any(du_lieu.startswith(m) for m in LOAI_TEP[duoi][1]):
            return duoi
    return None


def kiem_magic(duoi, du_lieu):
    """Nội dung thật phải đúng loại của đuôi tệp (jpg và jpeg cùng loại), không thì 415."""
    that = nhan_dien(du_lieu)
    if that is None or LOAI_TEP[that][0] != LOAI_TEP[duoi][0]:
        raise LoiTep(415, f"Nội dung tệp không phải .{duoi} (kiểm magic bytes)", {"nhanDien": that})


# --- Quy tắc quyền (dữ liệu đã đọc qua RLS bằng token người dùng) ----------------------------
TRANG_THAI_NHAN_TEP = ("moi", "cho_bo_sung")


def kiem_quyen_tai_len(vai, sub, ho_so):
    """Chỉ công dân, vào hồ sơ của chính mình, khi hồ sơ mới nộp hoặc đang chờ bổ sung.
    ho_so: dòng ho_so đọc bằng token người gọi (None = không tồn tại hoặc RLS không cho xem)."""
    if vai != "cong_dan":
        raise LoiTep(403, "Chỉ công dân tải tệp lên hồ sơ")
    if ho_so is None:
        raise LoiTep(404, "Không thấy hồ sơ")
    if ho_so.get("nguoi_nop_sub") != sub:
        raise LoiTep(403, "Chỉ người nộp được tải tệp lên hồ sơ")
    if ho_so.get("trang_thai") not in TRANG_THAI_NHAN_TEP:
        raise LoiTep(409, "Hồ sơ không ở trạng thái nhận thêm tệp (mới nộp hoặc chờ bổ sung)")


def kiem_quyen_xem(vai, thay_qua_rls, ton_tai):
    """Xem tệp theo RLS của người gọi: công dân – hồ sơ của mình; cán bộ – lĩnh vực phụ trách;
    lãnh đạo – mọi hồ sơ (chỉ xem). Tệp có thật mà RLS không cho thấy → 403, không có → 404."""
    if vai not in ("cong_dan", "can_bo", "lanh_dao"):
        raise LoiTep(403, "Vai trò không được xem tệp hồ sơ")
    if thay_qua_rls:
        return
    if ton_tai:
        raise LoiTep(403, "Không có quyền xem tệp của hồ sơ này")
    raise LoiTep(404, "Không thấy tệp")


# --- Ký AWS Signature V4 cho S3 (Garage) ------------------------------------------------
# https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-authenticating-requests.html
def _ma_hoa(s, giu="-_.~"):
    return urllib.parse.quote(s, safe=giu)


def _khoa_ky(secret, ngay, vung, dich_vu="s3"):
    k = hmac.new(("AWS4" + secret).encode(), ngay.encode(), hashlib.sha256).digest()
    for phan in (vung, dich_vu, "aws4_request"):
        k = hmac.new(k, phan.encode(), hashlib.sha256).digest()
    return k


def _chu_ky(method, url, vung, secret, luc, tieu_de_ky, query, payload_sha):
    """→ (chữ ký hex, phạm vi credential, danh sách header đã ký)."""
    u = urllib.parse.urlsplit(url)
    ngay = luc.strftime("%Y%m%d")
    pham_vi = f"{ngay}/{vung}/s3/aws4_request"
    header = {k.lower(): " ".join(str(v).split()) for k, v in tieu_de_ky.items()}
    header["host"] = u.netloc
    ten_header = ";".join(sorted(header))
    if "X-Amz-SignedHeaders" in query:
        query["X-Amz-SignedHeaders"] = ten_header
    chuan = "\n".join([
        method,
        _ma_hoa(urllib.parse.unquote(u.path) or "/", "-_.~/"),
        "&".join(f"{_ma_hoa(k)}={_ma_hoa(v)}" for k, v in sorted(query.items())),
        "".join(f"{k}:{header[k]}\n" for k in sorted(header)),
        ten_header,
        payload_sha,
    ])
    can_ky = "\n".join(["AWS4-HMAC-SHA256", luc.strftime("%Y%m%dT%H%M%SZ"), pham_vi,
                        hashlib.sha256(chuan.encode()).hexdigest()])
    ky = hmac.new(_khoa_ky(secret, ngay, vung), can_ky.encode(), hashlib.sha256).hexdigest()
    return ky, pham_vi, ten_header


def ky_header(method, url, vung, access_key, secret, payload_sha, tieu_de=None, luc=None):
    """Header cần thêm vào request S3 (Authorization, x-amz-date, x-amz-content-sha256).
    tieu_de: header khác cũng được ký (vd. Content-Type)."""
    luc = luc or datetime.datetime.now(datetime.timezone.utc)
    ky_them = {**(tieu_de or {}), "x-amz-date": luc.strftime("%Y%m%dT%H%M%SZ"),
               "x-amz-content-sha256": payload_sha}
    query = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(url).query, keep_blank_values=True))
    ky, pham_vi, ten_header = _chu_ky(method, url, vung, secret, luc, ky_them, query, payload_sha)
    return {**ky_them, "Authorization": f"AWS4-HMAC-SHA256 Credential={access_key}/{pham_vi}, "
                                        f"SignedHeaders={ten_header}, Signature={ky}"}


def presign(method, url, vung, access_key, secret, het_han_giay, luc=None, query_them=None):
    """URL đã ký sẵn (presigned), hết hạn sau het_han_giay giây (1–604800)."""
    if not 1 <= het_han_giay <= 604800:
        raise ValueError("het_han_giay phải trong 1–604800")
    luc = luc or datetime.datetime.now(datetime.timezone.utc)
    ngay = luc.strftime("%Y%m%d")
    query = {**(query_them or {}),
             "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
             "X-Amz-Credential": f"{access_key}/{ngay}/{vung}/s3/aws4_request",
             "X-Amz-Date": luc.strftime("%Y%m%dT%H%M%SZ"),
             "X-Amz-Expires": str(het_han_giay),
             "X-Amz-SignedHeaders": "host"}
    ky, _, _ = _chu_ky(method, url, vung, secret, luc, {}, query, "UNSIGNED-PAYLOAD")
    query["X-Amz-Signature"] = ky
    goc = url.split("?", 1)[0]
    return goc + "?" + "&".join(f"{_ma_hoa(k)}={_ma_hoa(v)}" for k, v in sorted(query.items()))


def content_disposition(ten):
    """Header Content-Disposition xem trực tiếp, tên tệp Unicode theo RFC 6266/5987."""
    ascii_ = "".join(c if c.isascii() and c.isprintable() and c not in '"\\;' else "_" for c in ten)
    return f"inline; filename=\"{ascii_}\"; filename*=UTF-8''{_ma_hoa(ten, '')}"


# --- clamd (giao thức TCP INSTREAM) --------------------------------------------------------
# https://docs.clamav.net/manual/Usage/Scanning.html#clamd
def _clamd(host, port, lenh, du_lieu=None, timeout=60, khoi=64 * 1024):
    try:
        with socket.create_connection((host, port), timeout=timeout) as s:
            s.sendall(b"z" + lenh + b"\0")
            if du_lieu is not None:
                for i in range(0, len(du_lieu), khoi):
                    phan = du_lieu[i:i + khoi]
                    s.sendall(struct.pack(">I", len(phan)) + phan)
                s.sendall(struct.pack(">I", 0))
            tra = b""
            while not tra.endswith(b"\0"):
                nhan = s.recv(4096)
                if not nhan:
                    break
                tra += nhan
    except OSError as e:
        raise LoiTep(503, "Dịch vụ quét mã độc chưa sẵn sàng, chưa lưu tệp") from e
    return tra.rstrip(b"\0").decode("utf-8", "replace").strip()


def doc_ket_qua_quet(tra):
    """Dòng trả về của INSTREAM → (sạch?, tên mẫu virus hoặc None). Lỗi clamd → 503."""
    if tra.endswith(" OK"):
        return True, None
    if tra.endswith(" FOUND"):
        return False, tra.split(":", 1)[-1].strip()[: -len(" FOUND")].strip()
    raise LoiTep(503, "Dịch vụ quét mã độc báo lỗi, chưa lưu tệp", {"clamd": tra[:200]})


def quet_clamav(host, port, du_lieu, timeout=60):
    return doc_ket_qua_quet(_clamd(host, port, b"INSTREAM", du_lieu, timeout))


def phien_ban_clamav(host, port):
    return _clamd(host, port, b"VERSION", timeout=5)
