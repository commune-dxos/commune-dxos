# SPDX-License-Identifier: Apache-2.0
"""Sự kiện hồ sơ của mot-cua (#9): định dạng, kiểm tra, quy tắc "sắp trễ hạn". Hàm thuần,
không gọi mạng (test đơn vị: tests/test_su_kien.py).

Định dạng phiên bản 1 (danh mục và ví dụ: mot-cua/README.md), một object JSON:
  phienBan  1 (số nguyên; đổi khi bỏ/đổi nghĩa trường, thêm trường thì không đổi)
  id        uuid của sự kiện; phát lại cùng sự kiện thì giữ nguyên id (consumer chống trùng)
  loai      một trong LOAI, cũng là routing key trên exchange EXCHANGE
  luc       thời điểm xảy ra, ISO 8601 có múi giờ (giờ Việt Nam)
  nguon     dịch vụ phát ("mot-cua")
  hoSoId, maHoSo, linhVuc, thuTuc   định danh nội bộ của hồ sơ, mã lĩnh vực, mã thủ tục
  duLieu    object, riêng theo từng loại
KHÔNG chứa dữ liệu cá nhân của công dân (họ tên, số điện thoại, sub người nộp…): kiem() từ
chối sự kiện có các khóa trong KHOA_CAM ở bất kỳ mức nào.
"""

import datetime
import json
import re
import uuid

PHIEN_BAN = 1
NGUON = "mot-cua"
# Topology khai báo trong mot-cua/rabbitmq/definitions.json (rabbitmq-init nạp).
EXCHANGE = "mot_cua.su_kien"
QUEUE_NHAT_KY = "mot_cua.nhat_ky"
LOAI = ("ho_so.moi", "ho_so.chuyen_buoc", "ho_so.hoan_tat", "ho_so.tu_choi", "ho_so.sap_tre_han")
# Khóa không bao giờ được xuất hiện trong sự kiện (dữ liệu cá nhân của người nộp).
KHOA_CAM = {"hoTen", "hoTenNguoiNop", "ho_ten", "ho_ten_nguoi_nop", "soDienThoai", "so_dien_thoai",
            "nguoiNopSub", "nguoi_nop_sub", "email", "cccd", "soCccd", "diaChi", "dia_chi", "ngaySinh"}
KHOA = ("phienBan", "id", "loai", "luc", "nguon", "hoSoId", "maHoSo", "linhVuc", "thuTuc", "duLieu")

# Giờ Việt Nam (không có giờ mùa hè). Image python alpine không có tzdata nên dùng offset cố định.
VN = datetime.timezone(datetime.timedelta(hours=7))
# Hết hạn lúc 17:00 của ngày han_xu_ly, khớp main.GIO_HET_HAN (hẹn giờ quá hạn trong BPMN).
GIO_HET_HAN = datetime.time(17, 0)

_UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")


def bay_gio():
    return datetime.datetime.now(VN)


def dich(loai):
    """Đích STOMP để phát sự kiện loại này (routing key = loai)."""
    return f"/exchange/{EXCHANGE}/{loai}"


def tao(loai, ho_so, du_lieu=None, luc=None, ma=None):
    """→ sự kiện (dict) đã kiểm tra.

    ho_so: dòng ho_so đọc bằng tài khoản dịch vụ sự kiện, dạng
      {"id", "ma_ho_so", "thu_tuc": {"ma", "linh_vuc": {"ma"}}} (thu_tuc có thể thiếu)."""
    tt = ho_so.get("thu_tuc") or {}
    su_kien = {
        "phienBan": PHIEN_BAN,
        "id": str(ma or uuid.uuid4()),
        "loai": loai,
        "luc": (luc or bay_gio()).astimezone(VN).isoformat(timespec="seconds"),
        "nguon": NGUON,
        "hoSoId": ho_so["id"],
        "maHoSo": ho_so["ma_ho_so"],
        "linhVuc": (tt.get("linh_vuc") or {}).get("ma"),
        "thuTuc": tt.get("ma"),
        "duLieu": du_lieu or {},
    }
    return kiem(su_kien)


def _khoa_cam(gia_tri, duong="duLieu"):
    if isinstance(gia_tri, dict):
        for k, v in gia_tri.items():
            if k in KHOA_CAM:
                raise ValueError(f"sự kiện chứa dữ liệu cá nhân: {duong}.{k}")
            _khoa_cam(v, f"{duong}.{k}")
    elif isinstance(gia_tri, list):
        for i, v in enumerate(gia_tri):
            _khoa_cam(v, f"{duong}[{i}]")


def kiem(su_kien):
    """Kiểm một sự kiện (đã parse JSON) theo định dạng phiên bản 1 → trả lại chính nó.
    Sai → ValueError (consumer NACK tin đó sang hàng đợi lỗi)."""
    if not isinstance(su_kien, dict):
        raise ValueError("sự kiện phải là object JSON")
    thieu = [k for k in KHOA if k not in su_kien]
    la = sorted(set(su_kien) - set(KHOA))
    if thieu or la:
        raise ValueError(f"sai khóa: thiếu {thieu}, thừa {la}")
    if su_kien["phienBan"] != PHIEN_BAN or isinstance(su_kien["phienBan"], bool):
        raise ValueError(f"phienBan {su_kien['phienBan']!r} không hỗ trợ")
    for k in ("id", "hoSoId"):
        if not isinstance(su_kien[k], str) or not _UUID.fullmatch(su_kien[k]):
            raise ValueError(f"{k} phải là uuid chữ thường")
    if su_kien["loai"] not in LOAI:
        raise ValueError(f"loai {su_kien['loai']!r} không có trong danh mục")
    if not isinstance(su_kien["maHoSo"], str) or not su_kien["maHoSo"]:
        raise ValueError("thiếu maHoSo")
    for k in ("linhVuc", "thuTuc", "nguon"):
        if su_kien[k] is not None and not isinstance(su_kien[k], str):
            raise ValueError(f"{k} phải là chuỗi")
    try:
        luc = datetime.datetime.fromisoformat(su_kien["luc"])
    except (TypeError, ValueError):
        raise ValueError("luc phải là thời điểm ISO 8601") from None
    if luc.tzinfo is None:
        raise ValueError("luc phải có múi giờ")
    if not isinstance(su_kien["duLieu"], dict):
        raise ValueError("duLieu phải là object")
    _khoa_cam(su_kien["duLieu"])
    return su_kien


def giai_ma(body):
    """bytes nhận từ RabbitMQ → sự kiện đã kiểm. Sai → ValueError."""
    try:
        su_kien = json.loads(body)
    except (ValueError, UnicodeDecodeError):
        raise ValueError("body không phải JSON") from None
    return kiem(su_kien)


# --- Hạn xử lý theo ngày làm việc ---------------------------------------------------------
def la_ngay_lam_viec(ngay, ngay_nghi):
    """Thứ Hai–Sáu và không phải ngày nghỉ lễ (giống mot_cua_noi_bo.la_ngay_lam_viec)."""
    return ngay.isoweekday() < 6 and ngay not in ngay_nghi


def ngay_lam_viec_con_lai(hom_nay, han, ngay_nghi=frozenset()):
    """Số ngày làm việc d với hom_nay < d ≤ han: 0 = hạn là hôm nay (hoặc chỉ còn ngày nghỉ
    trước hạn), 1 = hạn là ngày làm việc kế tiếp. han < hom_nay → -1 (đã qua hạn)."""
    if han < hom_nay:
        return -1
    return sum(1 for i in range(1, (han - hom_nay).days + 1)
               if la_ngay_lam_viec(hom_nay + datetime.timedelta(days=i), ngay_nghi))


def het_han_luc(han):
    """Ngày hạn xử lý → thời điểm hết hạn (17:00 giờ Việt Nam)."""
    return datetime.datetime.combine(han, GIO_HET_HAN, VN)


def sap_tre_han(han, luc, ngay_nghi=frozenset(), nguong=1):
    """Hồ sơ hạn `han` (date) có phải cảnh báo sắp trễ hạn tại thời điểm `luc` không.
    → (True/False, số ngày làm việc còn lại). Đã quá giờ hết hạn → (False, -1): việc của
    hẹn giờ quá hạn trong BPMN, không phải cảnh báo sắp trễ."""
    if luc >= het_han_luc(han):
        return False, -1
    con_lai = ngay_lam_viec_con_lai(luc.astimezone(VN).date(), han, ngay_nghi)
    return 0 <= con_lai <= nguong, con_lai


def khoa_sap_tre_han(ho_so_id, han):
    """Khóa chống trùng: mỗi hồ sơ một cảnh báo cho mỗi hạn xử lý (gia hạn → được cảnh báo lại)."""
    return f"ho_so.sap_tre_han:{ho_so_id}:{han.isoformat()}"


def dong_hop_thu(su_kien, khoa_chong_trung=None):
    """Sự kiện → dòng mot_cua.hop_thu_su_kien (outbox)."""
    return {"id": su_kien["id"], "loai": su_kien["loai"], "ho_so_id": su_kien["hoSoId"],
            "khoa_chong_trung": khoa_chong_trung, "noi_dung": su_kien}


def dong_nhat_ky(su_kien):
    """Sự kiện đã nhận → dòng mot_cua.nhat_ky_su_kien (consumer mẫu)."""
    return {"su_kien_id": su_kien["id"], "loai": su_kien["loai"], "ho_so_id": su_kien["hoSoId"],
            "ma_ho_so": su_kien["maHoSo"], "linh_vuc": su_kien["linhVuc"], "xay_ra_luc": su_kien["luc"],
            "noi_dung": su_kien}
