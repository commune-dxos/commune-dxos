# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Poka-yoke phía máy chủ (#59): kiểm thành phần hồ sơ theo JSON Schema 2020-12 của thủ tục
trước khi mot-cua-api khởi tạo quy trình Flowable.

Lớp thứ hai sau form của cổng công dân (#53, Ajv): người gọi thẳng /workflow cũng không khởi tạo
được hồ sơ thiếu giấy tờ. Tài liệu được kiểm dựng từ CSDL, không lấy từ client:

  {"ho_so": {"ho_ten_nguoi_nop", "so_dien_thoai"},
   "thanh_phan": {"<mã thành phần>": ["<id thanh_phan_ho_so>", …]}}

Chỉ tệp đã quét sạch (ket_qua_quet = 'sach') và đã có object trong kho mới được tính. Schema là
thu_tuc.json_schema (thanh-phan-ho-so.schema.json của gói). Phần thuần, không gọi mạng, để test
đơn vị được; main.py đọc dữ liệu và gọi kiem().

Dùng thư viện jsonschema (MIT, mot-cua/backend/requirements.txt), validator Draft 2020-12 có
kiểm format (uuid).
"""

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError

COT_HO_SO = ("ho_ten_nguoi_nop", "so_dien_thoai")


class LoiSchema(Exception):
    """Schema của thủ tục trong CSDL không phải JSON Schema 2020-12 hợp lệ (lỗi cấu hình)."""


def tai_lieu(ho_so, ds_tep):
    """ho_so: dòng ho_so; ds_tep: dòng thanh_phan_ho_so kèm thanh_phan_yeu_cau(ma).
    → (tài liệu để kiểm, {mã thành phần có tệp nhưng chưa tệp nào sạch})."""
    thanh_phan, chua_sach = {}, set()
    for t in ds_tep:
        ma = (t.get("thanh_phan_yeu_cau") or {}).get("ma")
        if not ma:
            continue  # giấy tờ khác, không gắn thành phần của thủ tục
        if t.get("ket_qua_quet") == "sach" and t.get("object_key"):
            thanh_phan.setdefault(ma, []).append(t["id"])
        else:
            chua_sach.add(ma)
    hs = {k: ho_so[k] for k in COT_HO_SO if ho_so.get(k) is not None}
    return {"ho_so": hs, "thanh_phan": thanh_phan}, chua_sach - set(thanh_phan)


def _ten(schema, ma):
    dn = (((schema.get("properties") or {}).get("thanh_phan") or {}).get("properties") or {}).get(ma)
    return (dn or {}).get("title") or ma


def kiem(schema, doc, chua_sach=()):
    """→ danh sách lỗi [{"thanhPhan", "ten", "loi"}], rỗng = đủ thành phần.
    Schema hỏng → LoiSchema (không phải lỗi của người nộp)."""
    try:
        Draft202012Validator.check_schema(schema)
    except SchemaError as e:
        raise LoiSchema(e.message) from None
    v = Draft202012Validator(schema, format_checker=Draft202012Validator.FORMAT_CHECKER)
    loi, da_bao = [], set()

    def them(ma, thong_diep):
        if (ma, thong_diep) not in da_bao:
            da_bao.add((ma, thong_diep))
            loi.append({"thanhPhan": ma, "ten": _ten(schema, ma) if ma else None, "loi": thong_diep})

    for e in sorted(v.iter_errors(doc), key=lambda e: list(e.absolute_path)):
        duong = list(e.absolute_path)
        ma = duong[1] if len(duong) > 1 and duong[0] == "thanh_phan" else None
        if e.validator == "required" and duong == ["thanh_phan"]:
            for thieu in e.validator_value:
                if thieu not in e.instance:
                    if thieu in chua_sach:
                        them(thieu, "Tệp đã nộp chưa được quét sạch, chưa tính là đã nộp")
                    else:
                        them(thieu, "Thiếu thành phần bắt buộc")
        elif e.validator == "required":
            them(None, f"Thiếu trường bắt buộc: {', '.join(map(str, e.validator_value))}")
        elif e.validator == "additionalProperties" and duong == ["thanh_phan"]:
            for la in sorted(set(e.instance) - set((e.schema.get("properties") or {}))):
                them(la, "Thành phần không thuộc thủ tục này")
        elif e.validator == "minItems" and ma:
            them(ma, f"Cần ít nhất {e.validator_value} tệp")
        elif e.validator == "maxItems" and ma:
            them(ma, f"Chỉ được tối đa {e.validator_value} tệp")
        elif ma:
            them(ma, "Dữ liệu thành phần không hợp lệ")
        else:
            them(None, "Hồ sơ không khớp JSON Schema của thủ tục")
    return loi
