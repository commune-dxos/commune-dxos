# SPDX-License-Identifier: Apache-2.0
"""Đọc và kiểm một gói thủ tục thu-tuc/<goi>/ (D-009), phần thuần của bộ nạp (không gọi mạng).

Một gói gồm đúng các tệp trong TEP_BAT_BUOC:
  thu-tuc.yaml                  mã, tên, lĩnh vực, thời hạn (ngày làm việc), lệ phí, căn cứ pháp lý,
                                process id của quy trình
  quy-trinh.bpmn20.xml          BPMN 2.0 viết tay, một process; biến từng bước khai bằng
                                flowable:formProperty
  thanh-phan-ho-so.schema.json  JSON Schema 2020-12 các thành phần hồ sơ (Poka-yoke)
  du-lieu-mau.json              hồ sơ mẫu GIẢ, phải khớp schema ở trên; khóa "xu_ly" (không bắt
                                buộc) là biến mẫu khi hoàn thành từng bước, phải khớp BPMN
  README.md                     mô tả ngắn cho người đọc
kiem_goi() trả (gói, []) nếu hợp lệ, (None, [lỗi…]) nếu không; gói lỗi thì bộ nạp bỏ qua.
Hướng dẫn viết gói: docs/thu-tuc.md. Test: tests/test_goi_thu_tuc.py.

thu-tuc.yaml dùng một TẬP CON của YAML (thư viện chuẩn Python không có YAML, image chạy bộ
nạp không cài gói): mỗi dòng `khóa: giá trị` ở đầu dòng, hoặc `khóa:` rồi các dòng `  - mục`.
Giá trị là số nguyên, true/false, chuỗi (có thể đặt trong nháy). Không có mapping lồng nhau,
chuỗi nhiều dòng, anchor. Viết ngoài tập con này → lỗi rõ dòng nào, không đoán.
"""

import hashlib
import json
import os
import re

import kiem_bpmn

TEP_YAML = "thu-tuc.yaml"
TEP_BPMN = "quy-trinh.bpmn20.xml"
TEP_SCHEMA = "thanh-phan-ho-so.schema.json"
TEP_MAU = "du-lieu-mau.json"
TEP_BAT_BUOC = (TEP_YAML, TEP_BPMN, TEP_SCHEMA, TEP_MAU, "README.md")
JSON_SCHEMA_2020_12 = "https://json-schema.org/draft/2020-12/schema"

RE_GOI = re.compile(r"^[a-z0-9][a-z0-9-]{1,59}$")
RE_MA = re.compile(r"^[A-Z0-9][A-Z0-9_-]{1,29}$")
RE_LINH_VUC = re.compile(r"^[a-z][a-z0-9_]{1,39}$")
RE_PROCESS = re.compile(r"^[A-Za-z_][A-Za-z0-9_-]{0,254}$")
RE_THANH_PHAN = re.compile(r"^[a-z][a-z0-9_]{1,59}$")
RE_UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
RE_SO_DIEN_THOAI = re.compile(r"^0[0-9]{9}$")
# Dãy 9 hoặc 12 chữ số liền = dạng số CMND/CCCD: dữ liệu mẫu không được có (chỉ dữ liệu giả).
RE_GIONG_CCCD = re.compile(r"(?<![\w-])(\d{9}|\d{12})(?![\w-])")

# Khóa của thu-tuc.yaml → (kiểu, bắt buộc).
KHOA_YAML = {
    "ma": (str, True),
    "ten": (str, True),
    "linh_vuc": (str, True),
    "ten_linh_vuc": (str, True),
    "thoi_han_ngay_lam_viec": (int, True),
    "le_phi": (int, True),
    "ghi_chu_le_phi": (str, False),
    "can_cu_phap_ly": (list, True),
    "quy_trinh": (str, True),
    "cong_khai": (bool, False),
    "mo_ta": (str, False),
}
# Người nhận userTask mà bộ máy một cửa hiểu: nhóm = mã lĩnh vực của thủ tục hoặc lanh_dao;
# assignee chỉ là công dân nộp hồ sơ (biến quy trình nguoiNopSub do API một cửa đặt).
NHOM_LANH_DAO = "lanh_dao"
ASSIGNEE_CONG_DAN = "${nguoiNopSub}"


class LoiYaml(ValueError):
    pass


def _gia_tri(chuoi, so_dong):
    s = chuoi.strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in "\"'":
        return s[1:-1]
    if s and s[0] in "\"'[{&*!|>":
        raise LoiYaml(f"dòng {so_dong}: giá trị '{s}' ngoài tập con YAML được hỗ trợ")
    if re.fullmatch(r"-?[0-9]+", s):
        return int(s)
    if s in ("true", "false"):
        return s == "true"
    return s


def doc_yaml(noi_dung):
    """Tập con YAML (xem đầu tệp) → dict. Sai cú pháp → LoiYaml kèm số dòng."""
    kq, khoa_list = {}, None
    for so_dong, dong in enumerate(noi_dung.splitlines(), 1):
        if "\t" in dong:
            raise LoiYaml(f"dòng {so_dong}: không dùng ký tự tab")
        # Bỏ chú thích: '#' đầu dòng hoặc ' #' sau giá trị không nằm trong nháy.
        if re.match(r"^\s*#", dong):
            continue
        m = re.search(r"\s+#", dong)
        if m and dong[:m.start()].count('"') % 2 == 0 and dong[:m.start()].count("'") % 2 == 0:
            dong = dong[:m.start()]
        if not dong.strip() or dong.strip() in ("---", "..."):
            continue
        m = re.fullmatch(r"\s+-\s+(.*)", dong)
        if m:
            if khoa_list is None:
                raise LoiYaml(f"dòng {so_dong}: mục danh sách '-' không thuộc khóa nào")
            kq[khoa_list].append(_gia_tri(m.group(1), so_dong))
            continue
        m = re.fullmatch(r"([a-z_][a-z0-9_]*):(?:\s+(.*))?", dong)
        if not m:
            raise LoiYaml(f"dòng {so_dong}: cần dạng 'khóa: giá trị' ở đầu dòng hoặc '  - mục'")
        khoa, gt = m.group(1), m.group(2)
        if khoa in kq:
            raise LoiYaml(f"dòng {so_dong}: khóa '{khoa}' bị trùng")
        if gt is None or not gt.strip():
            kq[khoa], khoa_list = [], khoa
        else:
            kq[khoa], khoa_list = _gia_tri(gt, so_dong), None
    return kq


def kiem_mo_ta(mo_ta):
    """thu-tuc.yaml đã đọc → danh sách lỗi."""
    loi = []
    for khoa in sorted(set(mo_ta) - set(KHOA_YAML)):
        loi.append(f"{TEP_YAML}: khóa lạ '{khoa}' (nhận: {', '.join(KHOA_YAML)})")
    for khoa, (kieu, bat_buoc) in KHOA_YAML.items():
        if khoa not in mo_ta:
            if bat_buoc:
                loi.append(f"{TEP_YAML}: thiếu '{khoa}'")
            continue
        gt = mo_ta[khoa]
        # bool là con của int trong Python: không nhận true/false cho trường số.
        if not isinstance(gt, kieu) or (kieu is int and isinstance(gt, bool)):
            loi.append(f"{TEP_YAML}: '{khoa}' phải là {kieu.__name__}, đang là {gt!r}")
        elif kieu is str and not gt.strip():
            loi.append(f"{TEP_YAML}: '{khoa}' rỗng")
    if loi:
        return loi
    if not RE_MA.fullmatch(mo_ta["ma"]):
        loi.append(f"{TEP_YAML}: ma '{mo_ta['ma']}' phải gồm chữ HOA, số, '_' hoặc '-' (2–30 ký tự)")
    if not RE_LINH_VUC.fullmatch(mo_ta["linh_vuc"]):
        loi.append(f"{TEP_YAML}: linh_vuc '{mo_ta['linh_vuc']}' phải là mã chữ thường (ví dụ ho_tich)")
    if not 0 <= mo_ta["thoi_han_ngay_lam_viec"] <= 365:
        loi.append(f"{TEP_YAML}: thoi_han_ngay_lam_viec phải từ 0 (trong ngày) tới 365")
    if mo_ta["le_phi"] < 0:
        loi.append(f"{TEP_YAML}: le_phi không được âm")
    if not mo_ta["can_cu_phap_ly"] or not all(isinstance(c, str) and c.strip() for c in mo_ta["can_cu_phap_ly"]):
        loi.append(f"{TEP_YAML}: can_cu_phap_ly cần ít nhất một văn bản (mỗi mục một chuỗi)")
    if not RE_PROCESS.fullmatch(mo_ta["quy_trinh"]):
        loi.append(f"{TEP_YAML}: quy_trinh '{mo_ta['quy_trinh']}' không phải process id hợp lệ")
    return loi


def kiem_schema(schema):
    """thanh-phan-ho-so.schema.json đã đọc → (danh sách thành phần, lỗi). Mỗi thành phần:
    {"ma", "ten", "bat_buoc", "so_luong", "ghi_chu"} theo đúng thứ tự khai báo."""
    T = TEP_SCHEMA
    if not isinstance(schema, dict):
        return [], [f"{T}: phải là một object JSON"]
    loi = []
    if schema.get("$schema") != JSON_SCHEMA_2020_12:
        loi.append(f"{T}: \"$schema\" phải là \"{JSON_SCHEMA_2020_12}\"")
    if schema.get("type") != "object":
        loi.append(f"{T}: \"type\" phải là \"object\"")
    if "thanh_phan" not in (schema.get("required") or []):
        loi.append(f"{T}: \"required\" phải có \"thanh_phan\"")
    tp = (schema.get("properties") or {}).get("thanh_phan")
    if not isinstance(tp, dict):
        return [], loi + [f"{T}: thiếu properties.thanh_phan (object)"]
    if tp.get("type") != "object" or tp.get("additionalProperties") is not False:
        loi.append(f"{T}: properties.thanh_phan phải có \"type\": \"object\", \"additionalProperties\": false")
    cac_tp = tp.get("properties")
    if not isinstance(cac_tp, dict) or not cac_tp:
        return [], loi + [f"{T}: properties.thanh_phan.properties phải liệt kê ít nhất một thành phần"]
    bat_buoc = tp.get("required") or []
    if not isinstance(bat_buoc, list) or not all(isinstance(m, str) for m in bat_buoc):
        return [], loi + [f"{T}: properties.thanh_phan.required phải là mảng mã thành phần"]
    for ma in bat_buoc:
        if ma not in cac_tp:
            loi.append(f"{T}: thành phần bắt buộc '{ma}' không có trong properties")
    ds = []
    for ma, dn in cac_tp.items():
        noi = f"{T}: thành phần '{ma}'"
        if not RE_THANH_PHAN.fullmatch(ma):
            loi.append(f"{noi}: mã phải là chữ thường, số, '_' (2–60 ký tự)")
            continue
        if not isinstance(dn, dict):
            loi.append(f"{noi}: phải là object")
            continue
        ten, toi_thieu = dn.get("title"), dn.get("minItems", 0)
        if not isinstance(ten, str) or not ten.strip():
            loi.append(f"{noi}: thiếu \"title\" (tên hiển thị)")
        if dn.get("type") != "array" or not isinstance(dn.get("items"), dict) or dn["items"].get("type") != "string":
            loi.append(f"{noi}: phải là \"type\": \"array\" với \"items\": {{\"type\": \"string\"}} (id tệp đã tải)")
        if not isinstance(toi_thieu, int) or isinstance(toi_thieu, bool) or not 0 <= toi_thieu <= 20:
            loi.append(f"{noi}: \"minItems\" phải là số nguyên 0–20")
            continue
        if ma in bat_buoc and toi_thieu < 1:
            loi.append(f"{noi}: bắt buộc thì \"minItems\" phải ≥ 1")
        mo_ta = dn.get("description")
        if mo_ta is not None and not isinstance(mo_ta, str):
            loi.append(f"{noi}: \"description\" phải là chuỗi")
        ds.append({"ma": ma, "ten": (ten or "").strip(), "bat_buoc": ma in bat_buoc,
                   "so_luong": max(toi_thieu, 1), "ghi_chu": mo_ta})
    return ds, loi


def kiem_du_lieu_mau(mau, schema):
    """du-lieu-mau.json đã đọc, schema đã qua kiem_schema → danh sách lỗi."""
    T = TEP_MAU
    if not isinstance(mau, dict):
        return [f"{T}: phải là một object JSON"]
    loi = []
    m = RE_GIONG_CCCD.search(json.dumps(mau, ensure_ascii=False))
    if m:
        loi.append(f"{T}: có dãy số '{m.group(1)}' giống số CMND/CCCD; dữ liệu mẫu phải là dữ liệu giả")
    hs = mau.get("ho_so")
    if not isinstance(hs, dict) or not isinstance(hs.get("ho_ten_nguoi_nop"), str) or not hs["ho_ten_nguoi_nop"].strip():
        loi.append(f"{T}: cần \"ho_so\": {{\"ho_ten_nguoi_nop\": \"…\"}}")
    elif "so_dien_thoai" in hs and not RE_SO_DIEN_THOAI.fullmatch(str(hs["so_dien_thoai"])):
        loi.append(f"{T}: ho_so.so_dien_thoai phải có dạng 0xxxxxxxxx")
    tp = mau.get("thanh_phan")
    khai_bao = schema["properties"]["thanh_phan"]
    if not isinstance(tp, dict):
        return loi + [f"{T}: cần \"thanh_phan\": {{\"<mã thành phần>\": [\"<uuid>\", …]}}"]
    for ma in tp:
        if ma not in khai_bao["properties"]:
            loi.append(f"{T}: thành phần '{ma}' không có trong {TEP_SCHEMA}")
    for ma in khai_bao.get("required", []):
        if ma not in tp:
            loi.append(f"{T}: thiếu thành phần bắt buộc '{ma}'")
    for ma, ds in tp.items():
        dn = khai_bao["properties"].get(ma)
        if dn is None:
            continue
        if not isinstance(ds, list) or not all(isinstance(x, str) and RE_UUID.fullmatch(x) for x in ds):
            loi.append(f"{T}: thành phần '{ma}' phải là mảng uuid")
        elif len(ds) < dn.get("minItems", 0):
            loi.append(f"{T}: thành phần '{ma}' cần ít nhất {dn['minItems']} tệp")
    return loi


KIEU_JSON = {"boolean": bool, "string": str, "long": int}


def kiem_xu_ly_mau(mau, bien_theo_buoc):
    """Khóa "xu_ly" của du-lieu-mau.json: {bước: {biến: giá trị}} → lỗi nếu bước/biến không
    khai trong BPMN, sai kiểu hoặc thiếu biến bắt buộc."""
    xu_ly = mau.get("xu_ly")
    if xu_ly is None:
        return []
    if not isinstance(xu_ly, dict):
        return [f"{TEP_MAU}: \"xu_ly\" phải là object {{bước: {{biến: giá trị}}}}"]
    loi = []
    for buoc, bien in xu_ly.items():
        khai = bien_theo_buoc.get(buoc)
        if khai is None:
            loi.append(f"{TEP_MAU}: xu_ly có bước '{buoc}' không có trong {TEP_BPMN}")
            continue
        if not isinstance(bien, dict):
            loi.append(f"{TEP_MAU}: xu_ly.{buoc} phải là object")
            continue
        for ten, gt in bien.items():
            kb = khai.get(ten)
            kieu = KIEU_JSON.get((kb or {}).get("kieu"))
            if kb is None:
                loi.append(f"{TEP_MAU}: xu_ly.{buoc} có biến '{ten}' không khai formProperty trong BPMN")
            elif not isinstance(gt, kieu) or (kieu is not bool and isinstance(gt, bool)):
                loi.append(f"{TEP_MAU}: xu_ly.{buoc}.{ten} phải là {kb['kieu']}")
        for ten, kb in khai.items():
            if kb["bat_buoc"] and ten not in bien:
                loi.append(f"{TEP_MAU}: xu_ly.{buoc} thiếu biến bắt buộc '{ten}'")
    return loi


def kiem_quy_trinh(duong_bpmn, mo_ta):
    """→ (bien_theo_buoc, lỗi). bien_theo_buoc = {bước: {biến: {"kieu", "bat_buoc"}}}."""
    loi, _ = kiem_bpmn.kiem([duong_bpmn], os.path.dirname(os.path.dirname(duong_bpmn)))
    if loi:
        return None, loi
    process = kiem_bpmn.doc_process(duong_bpmn)
    if process is None:
        return None, [f"{TEP_BPMN}: phải có đúng một <process>"]
    if process.get("id") != mo_ta["quy_trinh"]:
        return None, [f"{TEP_BPMN}: process id '{process.get('id')}' khác quy_trinh "
                      f"'{mo_ta['quy_trinh']}' trong {TEP_YAML}"]
    buoc = kiem_bpmn.buoc_nguoi_xu_ly(process)
    if not buoc:
        return None, [f"{TEP_BPMN}: quy trình không có userTask nào cho người xử lý"]
    nhom_hop_le = {mo_ta["linh_vuc"], NHOM_LANH_DAO}
    for bid, b in buoc.items():
        la = sorted(set(b["nhom"]) - nhom_hop_le)
        if la:
            loi.append(f"{TEP_BPMN}: bước '{bid}' giao cho nhóm {', '.join(la)}; chỉ nhận mã lĩnh vực "
                       f"'{mo_ta['linh_vuc']}' hoặc '{NHOM_LANH_DAO}'")
        if b["assignee"] and b["assignee"] != ASSIGNEE_CONG_DAN:
            loi.append(f"{TEP_BPMN}: bước '{bid}' có assignee '{b['assignee']}'; chỉ nhận {ASSIGNEE_CONG_DAN}")
    return {bid: b["bien"] for bid, b in buoc.items()}, loi


def sha256_goi(thu_muc):
    """SHA-256 trên tên + nội dung các tệp có nghĩa với hệ thống (không tính README)."""
    h = hashlib.sha256()
    for ten in (TEP_YAML, TEP_BPMN, TEP_SCHEMA, TEP_MAU):
        with open(os.path.join(thu_muc, ten), "rb") as f:
            h.update(ten.encode() + b"\0" + f.read() + b"\0")
    return h.hexdigest()


def kiem_goi(thu_muc):
    """Thư mục gói → (dict gói sẵn sàng nạp, []) hoặc (None, [lỗi…]).

    Dict gói có các khóa mà RPC mot_cua.nap_thu_tuc nhận, cộng "bpmn" (nội dung XML) và
    "bpmn_sha256" cho bước deploy Flowable."""
    goi = os.path.basename(os.path.normpath(thu_muc))
    if not RE_GOI.fullmatch(goi):
        return None, [f"tên thư mục '{goi}' phải là chữ thường không dấu, số, '-' (ví dụ khai-sinh)"]
    thieu = [t for t in TEP_BAT_BUOC if not os.path.isfile(os.path.join(thu_muc, t))]
    if thieu:
        return None, [f"thiếu tệp: {', '.join(thieu)}"]

    def doc(ten):
        with open(os.path.join(thu_muc, ten), encoding="utf-8") as f:
            return f.read()

    try:
        mo_ta = doc_yaml(doc(TEP_YAML))
    except (LoiYaml, UnicodeDecodeError) as e:
        return None, [f"{TEP_YAML}: {e}"]
    loi = kiem_mo_ta(mo_ta)
    if loi:
        return None, loi
    json_doc = {}
    for ten in (TEP_SCHEMA, TEP_MAU):
        try:
            json_doc[ten] = json.loads(doc(ten))
        except (ValueError, UnicodeDecodeError) as e:
            loi.append(f"{ten}: JSON không hợp lệ: {e}")
    if loi:
        return None, loi
    thanh_phan, loi = kiem_schema(json_doc[TEP_SCHEMA])
    if loi:
        return None, loi
    loi = kiem_du_lieu_mau(json_doc[TEP_MAU], json_doc[TEP_SCHEMA])
    bien_theo_buoc, loi_bpmn = kiem_quy_trinh(os.path.join(thu_muc, TEP_BPMN), mo_ta)
    loi += loi_bpmn
    if bien_theo_buoc is not None:
        loi += kiem_xu_ly_mau(json_doc[TEP_MAU], bien_theo_buoc)
    if loi:
        return None, loi
    bpmn = doc(TEP_BPMN)
    return {
        "goi": goi,
        "ma": mo_ta["ma"],
        "ten": mo_ta["ten"].strip(),
        "linh_vuc": mo_ta["linh_vuc"],
        "ten_linh_vuc": mo_ta["ten_linh_vuc"].strip(),
        "so_ngay_xu_ly": mo_ta["thoi_han_ngay_lam_viec"],
        "le_phi": mo_ta["le_phi"],
        "ghi_chu_le_phi": mo_ta.get("ghi_chu_le_phi"),
        "can_cu_phap_ly": "; ".join(c.strip() for c in mo_ta["can_cu_phap_ly"]),
        "cong_khai": mo_ta.get("cong_khai", True),
        "quy_trinh": mo_ta["quy_trinh"],
        "bien_theo_buoc": bien_theo_buoc,
        "json_schema": json_doc[TEP_SCHEMA],
        "thanh_phan": thanh_phan,
        "goi_sha256": sha256_goi(thu_muc),
        "bpmn": bpmn,
        "bpmn_sha256": hashlib.sha256(bpmn.encode()).hexdigest(),
    }, []


def quet(thu_muc_goc):
    """→ danh sách (tên thư mục, đường dẫn) của mọi thư mục con không ẩn, theo tên."""
    if not os.path.isdir(thu_muc_goc):
        return []
    return [(t, os.path.join(thu_muc_goc, t)) for t in sorted(os.listdir(thu_muc_goc))
            if not t.startswith((".", "_")) and os.path.isdir(os.path.join(thu_muc_goc, t))]
