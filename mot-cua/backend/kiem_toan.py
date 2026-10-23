# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Trình xác minh ĐỘC LẬP nhật ký kiểm toán chuỗi băm của mot-cua (#75). Chỉ thư viện chuẩn.

CSDL đã có RPC xac_minh_kiem_toan (db/migrations/007_nhat_ky_kiem_toan.sql), nhưng người kiểm tra
không cần tin hàm chạy trong chính CSDL được kiểm: công cụ này đọc bản ghi qua API (lãnh đạo,
APISIX /api), tự dựng lại nội dung chuẩn và tính lại SHA-256 từng bản ghi, rồi báo cùng định dạng
với RPC: {"hopLe", "soBanGhi", "sttCuoi", "bamCuoi", "dauChuoi", "loi": null | {stt, loai, moTa}}.

Nội dung chuẩn của một bản ghi = văn bản jsonb (PostgreSQL) của
  {stt, luc, hanhDong, doiTuong, doiTuongId, nguoiSub, vaiTro, nguon, duLieu}
với luc là giờ UTC dạng 2026-10-23T08:01:02.123456Z; bam = hex(SHA-256(bam_truoc + nội dung)).
Văn bản jsonb: khóa object sắp theo độ dài (byte UTF-8) rồi theo byte, phân cách ", " và ": ",
chuỗi thoát như JSON nhưng giữ nguyên ký tự ngoài ASCII (van_ban_jsonb).

Chạy:
  DXOS_TOKEN=<token lãnh đạo> python3 kiem_toan.py --api http://localhost:9080/api [--moc STT:BAM]
  python3 kiem_toan.py --tep ban-ghi.json [--dau-chuoi '{"stt": n, "bam": "…"}']
Mã thoát: 0 hợp lệ, 1 không hợp lệ, 2 lỗi đọc dữ liệu.
"""

import argparse
import datetime
import decimal
import hashlib
import json
import os
import sys
import urllib.parse
import urllib.request

BAM_GOC = "0" * 64
TRANG = 1000  # PGRST_DB_MAX_ROWS


def van_ban_jsonb(gia_tri):
    """Văn bản jsonb::text của PostgreSQL cho giá trị JSON (dict, list, str, int, Decimal, bool, None)."""
    if gia_tri is None:
        return "null"
    if gia_tri is True:
        return "true"
    if gia_tri is False:
        return "false"
    if isinstance(gia_tri, str):
        return json.dumps(gia_tri, ensure_ascii=False)
    if isinstance(gia_tri, int):
        return str(gia_tri)
    if isinstance(gia_tri, decimal.Decimal):
        return format(gia_tri, "f")
    if isinstance(gia_tri, float):
        raise ValueError("số thực phải đọc bằng Decimal (json.loads(..., parse_float=Decimal))")
    if isinstance(gia_tri, list):
        return "[" + ", ".join(van_ban_jsonb(v) for v in gia_tri) + "]"
    if isinstance(gia_tri, dict):
        khoa = sorted(gia_tri, key=lambda k: (len(k.encode()), k.encode()))
        return "{" + ", ".join(f"{van_ban_jsonb(k)}: {van_ban_jsonb(gia_tri[k])}" for k in khoa) + "}"
    raise ValueError(f"kiểu không có trong JSON: {type(gia_tri).__name__}")


def luc_utc(luc):
    """timestamptz PostgREST trả (ISO 8601, có múi giờ) → dạng chuẩn UTC micro giây."""
    t = datetime.datetime.fromisoformat(luc.replace("Z", "+00:00"))
    if t.tzinfo is None:
        raise ValueError(f"luc thiếu múi giờ: {luc}")
    return t.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def noi_dung(ban_ghi):
    """Nội dung chuẩn của một bản ghi (cột như bảng mot_cua.nhat_ky_kiem_toan)."""
    return van_ban_jsonb({
        "stt": ban_ghi["stt"], "luc": luc_utc(ban_ghi["luc"]), "hanhDong": ban_ghi["hanh_dong"],
        "doiTuong": ban_ghi["doi_tuong"], "doiTuongId": ban_ghi.get("doi_tuong_id"),
        "nguoiSub": ban_ghi.get("nguoi_sub"), "vaiTro": ban_ghi["vai_tro"], "nguon": ban_ghi["nguon"],
        "duLieu": ban_ghi["du_lieu"],
    })


def bam(bam_truoc, ban_ghi):
    return hashlib.sha256((bam_truoc + noi_dung(ban_ghi)).encode()).hexdigest()


class XacMinh:
    """Xác minh dần theo stt tăng (đọc theo trang không cần giữ cả chuỗi trong bộ nhớ)."""

    def __init__(self, moc=None):
        self.stt = 0
        self.truoc = BAM_GOC
        self.loi = None
        self.moc = moc  # (stt, bam) lưu ở ngoài
        self._gap_moc = moc is None

    def _hong(self, stt, loai, mo_ta):
        self.loi = {"stt": stt, "loai": loai, "moTa": mo_ta}

    def them(self, ban_ghi):
        """→ False khi đã gặp chỗ hỏng (dừng đọc tiếp)."""
        if self.loi:
            return False
        stt = ban_ghi["stt"]
        if stt != self.stt + 1:
            self._hong(self.stt + 1, "thieu_ban_ghi", f"Không còn bản ghi {self.stt + 1} (bản ghi kế tiếp là {stt})")
        elif ban_ghi["bam_truoc"] != self.truoc:
            self._hong(stt, "lien_ket_dut", f"bam_truoc của bản ghi {stt} khác bam của bản ghi {self.stt}")
        elif bam(ban_ghi["bam_truoc"], ban_ghi) != ban_ghi["bam"]:
            self._hong(stt, "noi_dung_bi_sua", f"Nội dung bản ghi {stt} không khớp bam đã lưu")
        elif self.moc and stt == self.moc[0] and ban_ghi["bam"] != self.moc[1]:
            self._hong(stt, "moc_khong_khop", f"Bản ghi {stt} khác mốc đã lưu")
        if self.loi:
            return False
        self._gap_moc = self._gap_moc or stt == self.moc[0]
        self.truoc = ban_ghi["bam"]
        self.stt = stt
        return True

    def ket_qua(self, dau_chuoi=None):
        if not self.loi and not self._gap_moc:
            self._hong(self.moc[0], "moc_khong_khop", f"Không có bản ghi {self.moc[0]} của mốc đã lưu")
        elif not self.loi and dau_chuoi and (dau_chuoi["stt"] != self.stt or dau_chuoi["bam"] != self.truoc):
            self._hong(max(dau_chuoi["stt"], self.stt), "dau_chuoi_lech",
                       f"Đầu chuỗi ở bản ghi {dau_chuoi['stt']} nhưng chuỗi dừng ở bản ghi {self.stt}")
        return {"hopLe": self.loi is None, "soBanGhi": self.stt, "sttCuoi": self.stt, "bamCuoi": self.truoc,
                "dauChuoi": dau_chuoi, "loi": self.loi}


def xac_minh(ds_ban_ghi, dau_chuoi=None, moc=None):
    """Xác minh danh sách bản ghi (đã sắp theo stt)."""
    xm = XacMinh(moc)
    for ban_ghi in ds_ban_ghi:
        if not xm.them(ban_ghi):
            break
    return xm.ket_qua(dau_chuoi)


def _doc_json(body):
    return json.loads(body, parse_float=decimal.Decimal)


def _get(url, token):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return _doc_json(r.read())


def xac_minh_qua_api(api, token, moc=None):
    """Đọc đầu chuỗi rồi từng trang bản ghi qua PostgREST (/api), xác minh."""
    api = api.rstrip("/")
    dau = _get(f"{api}/dau_chuoi_kiem_toan?select=stt,bam", token)
    if len(dau) != 1:
        raise ValueError("không đọc được đầu chuỗi (cần token lãnh đạo)")
    xm = XacMinh(moc)
    tu = 0
    while True:
        q = urllib.parse.urlencode({"stt": f"gt.{tu}", "order": "stt", "limit": TRANG})
        trang = _get(f"{api}/nhat_ky_kiem_toan?{q}", token)
        for ban_ghi in trang:
            if not xm.them(ban_ghi):
                return xm.ket_qua(dau[0])
        if len(trang) < TRANG:
            return xm.ket_qua(dau[0])
        tu = trang[-1]["stt"]


def _moc(gia_tri):
    stt, _, b = gia_tri.partition(":")
    if not stt.isdigit() or len(b) != 64:
        raise argparse.ArgumentTypeError("mốc dạng STT:BAM (bam 64 chữ số hex)")
    return int(stt), b


def main(argv=None):
    ap = argparse.ArgumentParser(description="Xác minh độc lập nhật ký kiểm toán chuỗi băm (#75)")
    nguon = ap.add_mutually_exclusive_group(required=True)
    nguon.add_argument("--api", help="gốc PostgREST qua APISIX, ví dụ http://localhost:9080/api; token lấy từ DXOS_TOKEN")
    nguon.add_argument("--tep", help="tệp JSON: mảng bản ghi như GET /api/nhat_ky_kiem_toan?order=stt")
    ap.add_argument("--dau-chuoi", type=_doc_json, help='với --tep: đầu chuỗi {"stt": n, "bam": "…"}')
    ap.add_argument("--moc", type=_moc, help="mốc STT:BAM đã lưu ở ngoài từ lần xác minh trước")
    a = ap.parse_args(argv)
    try:
        if a.api:
            token = os.environ.get("DXOS_TOKEN", "")
            if not token:
                ap.error("thiếu biến môi trường DXOS_TOKEN")
            kq = xac_minh_qua_api(a.api, token, a.moc)
        else:
            with open(a.tep, encoding="utf-8") as f:
                kq = xac_minh(sorted(_doc_json(f.read()), key=lambda b: b["stt"]), a.dau_chuoi, a.moc)
    except (OSError, ValueError, KeyError) as e:
        print(f"kiem_toan: không đọc được nhật ký: {e}", file=sys.stderr)
        return 2
    print(json.dumps(kq, ensure_ascii=False, default=str))
    return 0 if kq["hopLe"] else 1


if __name__ == "__main__":
    sys.exit(main())
