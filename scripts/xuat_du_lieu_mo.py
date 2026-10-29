#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Sinh bộ dữ liệu mở "thủ tục hành chính cấp xã" (#102) từ các gói thu-tuc/<goi>/.

  python3 scripts/xuat_du_lieu_mo.py           ghi du-lieu-mo/thu-tuc-cap-xa/ (make du-lieu-mo)
  python3 scripts/xuat_du_lieu_mo.py --kiem    không ghi; thoát 1 nếu bản đã công bố lệch với gói (make check)

Đọc gói bằng đúng bộ kiểm của bộ nạp (mot-cua/backend/goi_thu_tuc.py): gói lỗi thì dừng, chỉ công bố thủ tục
cong_khai. Tệp sinh ra (không sửa tay):
  danh-muc.json          danh mục: mã, tên, lĩnh vực, thời hạn, lệ phí, căn cứ, thành phần hồ sơ, các bước
  danh-muc.csv           bảng phẳng cho bảng tính (UTF-8, phân cách bằng dấu phẩy)
  danh-muc.schema.json   JSON Schema 2020-12 mô tả danh-muc.json
  schema/<MA>.schema.json  đúng từng byte tệp thanh-phan-ho-so.schema.json của gói (Poka-yoke dùng tệp này)
  LICENSE                toàn văn CC-BY-4.0 (chép từ LICENSES/CC-BY-4.0.txt)
README.md trong thư mục viết tay. Không có ngày giờ trong tệp sinh: chạy lại không đổi gì nếu gói không đổi.
Dữ liệu sinh ra theo giấy phép CC-BY-4.0 (REUSE.toml); tệp mã này theo GPL-3.0-or-later. Chỉ thư viện chuẩn.
"""

import csv
import hashlib
import io
import json
import os
import sys

GOC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(GOC, "mot-cua", "backend"))

import goi_thu_tuc  # noqa: E402
import kiem_bpmn  # noqa: E402

THU_MUC_RA = os.path.join("du-lieu-mo", "thu-tuc-cap-xa")
GIAY_PHEP = "CC-BY-4.0"
REPO = "https://github.com/commune-dxos/commune-dxos"
VIET_TAY = {"README.md"}

SCHEMA_DANH_MUC = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "urn:dxos:du-lieu-mo:thu-tuc-cap-xa:danh-muc",
    "title": "Danh mục thủ tục hành chính cấp xã (Commune DX-OS)",
    "type": "object",
    "required": ["ten_bo_du_lieu", "giay_phep", "ghi_cong", "so_thu_tuc", "thu_tuc"],
    "properties": {
        "$schema": {"type": "string"},
        "ten_bo_du_lieu": {"type": "string"},
        "mo_ta": {"type": "string"},
        "giay_phep": {"const": GIAY_PHEP},
        "ghi_cong": {"type": "string"},
        "nguon": {"type": "string", "format": "uri"},
        "luu_y": {"type": "string"},
        "so_thu_tuc": {"type": "integer", "minimum": 0},
        "thu_tuc": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["ma", "ten", "linh_vuc", "thoi_han_ngay_lam_viec", "le_phi", "can_cu_phap_ly",
                             "thanh_phan", "cac_buoc", "schema", "schema_sha256", "goi"],
                "properties": {
                    "ma": {"type": "string", "pattern": "^[A-Z0-9][A-Z0-9_-]{1,29}$",
                           "description": "Mã thủ tục trong hệ thống"},
                    "ten": {"type": "string"},
                    "linh_vuc": {"type": "object", "required": ["ma", "ten"],
                                 "properties": {"ma": {"type": "string"}, "ten": {"type": "string"}}},
                    "thoi_han_ngay_lam_viec": {"type": "integer", "minimum": 0,
                                               "description": "0 = trong ngày tiếp nhận; bỏ thứ Bảy, Chủ nhật, ngày lễ"},
                    "le_phi": {"type": "integer", "minimum": 0, "description": "Đồng"},
                    "ghi_chu_le_phi": {"type": ["string", "null"]},
                    "can_cu_phap_ly": {"type": "array", "items": {"type": "string"}, "minItems": 1},
                    "thanh_phan": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["ma", "ten", "bat_buoc", "so_tep_toi_thieu"],
                            "properties": {
                                "ma": {"type": "string"}, "ten": {"type": "string"},
                                "bat_buoc": {"type": "boolean"},
                                "so_tep_toi_thieu": {"type": "integer", "minimum": 0},
                                "ghi_chu": {"type": ["string", "null"]},
                            },
                        },
                    },
                    "cac_buoc": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["ma", "ten", "nguoi_xu_ly"],
                            "properties": {
                                "ma": {"type": "string"}, "ten": {"type": "string"},
                                "nguoi_xu_ly": {"enum": ["can_bo_linh_vuc", "lanh_dao", "nguoi_nop"]},
                            },
                        },
                    },
                    "schema": {"type": "string", "description": "Đường dẫn tương đối tới JSON Schema thành phần hồ sơ"},
                    "schema_sha256": {"type": "string", "pattern": "^[0-9a-f]{64}$"},
                    "goi": {"type": "string", "description": "Thư mục gói trong kho mã nguồn"},
                },
            },
        },
    },
}


def _json(obj):
    return (json.dumps(obj, ensure_ascii=False, indent=2) + "\n").encode()


def _cac_buoc(duong_bpmn):
    """Các userTask theo thứ tự trong BPMN và ai xử lý (không công bố tên biến nội bộ)."""
    process = kiem_bpmn.doc_process(duong_bpmn)
    ds = []
    for bid, b in kiem_bpmn.buoc_nguoi_xu_ly(process).items():
        if b["assignee"]:
            ai = "nguoi_nop"
        elif goi_thu_tuc.NHOM_LANH_DAO in b["nhom"]:
            ai = "lanh_dao"
        else:
            ai = "can_bo_linh_vuc"
        ds.append({"ma": bid, "ten": b["ten"], "nguoi_xu_ly": ai})
    return ds


def sinh(goc=GOC):
    """→ {đường dẫn tương đối trong thư mục ra: nội dung bytes}. Gói lỗi → ValueError."""
    tep = {}
    thu_tuc, dong_csv = [], []
    for ten, duong in goi_thu_tuc.quet(os.path.join(goc, "thu-tuc")):
        goi, loi = goi_thu_tuc.kiem_goi(duong)
        if loi:
            raise ValueError(f"gói thu-tuc/{ten} lỗi, không công bố:\n  - " + "\n  - ".join(loi))
        if not goi["cong_khai"]:
            continue
        with open(os.path.join(duong, goi_thu_tuc.TEP_YAML), encoding="utf-8") as f:
            mo_ta = goi_thu_tuc.doc_yaml(f.read())
        with open(os.path.join(duong, goi_thu_tuc.TEP_SCHEMA), "rb") as f:
            schema = f.read()
        ten_schema = f"schema/{goi['ma']}.schema.json"
        tep[ten_schema] = schema
        muc = {
            "ma": goi["ma"],
            "ten": goi["ten"],
            "linh_vuc": {"ma": goi["linh_vuc"], "ten": goi["ten_linh_vuc"]},
            "thoi_han_ngay_lam_viec": goi["so_ngay_xu_ly"],
            "le_phi": goi["le_phi"],
            "ghi_chu_le_phi": goi["ghi_chu_le_phi"],
            "can_cu_phap_ly": [c.strip() for c in mo_ta["can_cu_phap_ly"]],
            "thanh_phan": [{"ma": t["ma"], "ten": t["ten"], "bat_buoc": t["bat_buoc"],
                            "so_tep_toi_thieu": t["so_luong"] if t["bat_buoc"] else 0, "ghi_chu": t["ghi_chu"]}
                           for t in goi["thanh_phan"]],
            "cac_buoc": _cac_buoc(os.path.join(duong, goi_thu_tuc.TEP_BPMN)),
            "schema": ten_schema,
            "schema_sha256": hashlib.sha256(schema).hexdigest(),
            "goi": f"thu-tuc/{ten}",
        }
        thu_tuc.append(muc)
        dong_csv.append([muc["ma"], muc["ten"], muc["linh_vuc"]["ma"], muc["linh_vuc"]["ten"],
                         muc["thoi_han_ngay_lam_viec"], muc["le_phi"], muc["ghi_chu_le_phi"] or "",
                         " | ".join(f"{t['ten']} ({t['so_tep_toi_thieu']})" for t in muc["thanh_phan"] if t["bat_buoc"]),
                         " | ".join(t["ten"] for t in muc["thanh_phan"] if not t["bat_buoc"]),
                         " | ".join(muc["can_cu_phap_ly"]), ten_schema])
    thu_tuc.sort(key=lambda m: m["ma"])
    dong_csv.sort(key=lambda d: d[0])
    tep["danh-muc.json"] = _json({
        "$schema": "./danh-muc.schema.json",
        "ten_bo_du_lieu": "Thủ tục hành chính cấp xã – thành phần hồ sơ và quy trình (Commune DX-OS)",
        "mo_ta": "Danh mục thủ tục mà bộ máy một cửa Commune DX-OS đang hỗ trợ, kèm JSON Schema 2020-12 thành phần "
                 "hồ sơ dùng để kiểm hồ sơ đủ giấy tờ trước khi nộp (Poka-yoke). Sinh tự động từ các gói thu-tuc/.",
        "giay_phep": GIAY_PHEP,
        "ghi_cong": f"Commune DX-OS – đội DTU_DZ_2 (OLP PMNM 2026), {REPO}",
        "nguon": f"{REPO}/tree/main/thu-tuc",
        "luu_y": "Giá trị lấy theo quy định công khai, rút gọn để minh họa; đối chiếu văn bản pháp luật gốc trước "
                 "khi dùng cho nghiệp vụ thật. Văn bản pháp luật không thuộc đối tượng bảo hộ quyền tác giả.",
        "so_thu_tuc": len(thu_tuc),
        "thu_tuc": thu_tuc,
    })
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(["ma", "ten", "linh_vuc", "ten_linh_vuc", "thoi_han_ngay_lam_viec", "le_phi", "ghi_chu_le_phi",
                "thanh_phan_bat_buoc", "thanh_phan_khong_bat_buoc", "can_cu_phap_ly", "schema"])
    w.writerows(dong_csv)
    tep["danh-muc.csv"] = buf.getvalue().encode()
    tep["danh-muc.schema.json"] = _json(SCHEMA_DANH_MUC)
    with open(os.path.join(goc, "LICENSES", f"{GIAY_PHEP}.txt"), "rb") as f:
        tep["LICENSE"] = f.read()
    return tep


def _hien_co(thu_muc):
    co = {}
    for goc_con, _, ds in os.walk(thu_muc):
        for t in ds:
            duong = os.path.join(goc_con, t)
            rel = os.path.relpath(duong, thu_muc).replace(os.sep, "/")
            if rel not in VIET_TAY:
                with open(duong, "rb") as f:
                    co[rel] = f.read()
    return co


def so_sanh(tep, thu_muc):
    """→ danh sách lỗi (thiếu, lệch, thừa) giữa nội dung sinh ra và thư mục đã công bố."""
    co = _hien_co(thu_muc) if os.path.isdir(thu_muc) else {}
    loi = [f"thiếu {t}" for t in sorted(set(tep) - set(co))]
    loi += [f"lệch {t}" for t in sorted(set(tep) & set(co)) if tep[t] != co[t]]
    loi += [f"thừa {t}" for t in sorted(set(co) - set(tep))]
    return loi


def ghi(tep, thu_muc):
    for rel in set(_hien_co(thu_muc)) - set(tep) if os.path.isdir(thu_muc) else ():
        os.remove(os.path.join(thu_muc, rel))
    for rel, noi_dung in tep.items():
        duong = os.path.join(thu_muc, rel)
        os.makedirs(os.path.dirname(duong), exist_ok=True)
        with open(duong, "wb") as f:
            f.write(noi_dung)


def main(argv):
    thu_muc = os.path.join(GOC, THU_MUC_RA)
    try:
        tep = sinh()
    except ValueError as e:
        print(f"LỖI: {e}", file=sys.stderr)
        return 1
    so = json.loads(tep["danh-muc.json"])["so_thu_tuc"]
    if "--kiem" in argv:
        loi = so_sanh(tep, thu_muc)
        if loi:
            print(f"LỖI: {THU_MUC_RA}/ lệch với các gói thu-tuc/ – chạy: make du-lieu-mo", file=sys.stderr)
            for l in loi:
                print(f"  - {l}", file=sys.stderr)
            return 1
        print(f"OK: dữ liệu mở {THU_MUC_RA}/ khớp {so} thủ tục công khai ({GIAY_PHEP}).")
        return 0
    ghi(tep, thu_muc)
    print(f"Đã ghi {THU_MUC_RA}/: {so} thủ tục, {len(tep)} tệp ({GIAY_PHEP}).")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
