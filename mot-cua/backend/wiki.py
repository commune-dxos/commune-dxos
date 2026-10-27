# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Wiki văn bản nội bộ cho cán bộ (#95): phần không phụ thuộc HTTP của mot-cua-api.

CSDL (bảng mot_cua.wiki_van_ban, migration 016) là nguồn sự thật và quyết định ai thấy gì bằng RLS. Meilisearch CE
(index `<tiền tố>wiki-van-ban`, khóa API riêng của Tầng 2 do meili-init cấp, dùng lại tri_thuc.Meili của #91) chỉ là
bản sao để tìm nhanh, có xếp hạng, chịu lỗi chính tả và đánh dấu đoạn khớp. Vì vậy khi tìm:

  1. bo_loc() dựng bộ lọc Meilisearch theo vai và lĩnh vực của người gọi (giống policy RLS), nên kết quả và số
     lượng đúng phạm vi ngay từ chỉ mục;
  2. mot-cua-api đối chiếu lại các id trả về với CSDL bằng token của người gọi (RLS), bỏ id nào người gọi không còn
     thấy (chỉ mục chậm một nhịp sau khi đổi phạm vi hay phân công);
  3. Meilisearch không chạy → tìm bằng RPC mot_cua.tim_wiki trong CSDL (so khớp không dấu, RLS của người gọi),
     kết quả ghi nguon = "csdl".

Đồng bộ chỉ mục: sau mỗi lần thêm/sửa (cập nhật một tài liệu) và định kỳ dựng lại toàn bộ từ CSDL bằng tài khoản
dịch vụ tệp (chỉ có quyền đọc wiki) – nên chỉ mục mất hay cũ đều tự sửa. Chỉ thư viện chuẩn.
"""

import datetime
import json
import re

TEN_INDEX = "wiki-van-ban"
LOAI = {"quy_che": "Quy chế", "huong_dan": "Hướng dẫn", "quy_trinh": "Quy trình", "bieu_mau": "Biểu mẫu",
        "thong_bao_noi_bo": "Thông báo nội bộ", "khac": "Khác"}
PHAM_VI = ("toan_xa", "linh_vuc", "lanh_dao")
VAI_DOC = ("can_bo", "lanh_dao", "van_thu")
VAI_GHI = ("van_thu", "lanh_dao")
COT = ("id,tieu_de,loai,so_ky_hieu,ngay_ban_hanh,tom_tat,noi_dung,pham_vi,linh_vuc_id,trang_thai,phien_ban,"
       "nguoi_sua_sub,sua_luc")
COT_KET_QUA = ("id", "tieu_de", "loai", "so_ky_hieu", "ngay_ban_hanh", "tom_tat", "pham_vi", "linh_vuc_id",
               "trang_thai", "phien_ban", "sua_luc")
TRUONG_GHI = ("tieu_de", "loai", "so_ky_hieu", "ngay_ban_hanh", "tom_tat", "noi_dung", "pham_vi", "linh_vuc_id",
              "trang_thai")
CAI_DAT_INDEX = {
    "searchableAttributes": ["tieu_de", "so_ky_hieu", "tom_tat", "noi_dung"],
    "filterableAttributes": ["pham_vi", "linh_vuc_id", "loai", "trang_thai"],
    "sortableAttributes": ["sua_luc_giay"],
    "localizedAttributes": [{"attributePatterns": ["*"], "locales": ["vie"]}],
}
# Đánh dấu đoạn khớp bằng hai ký tự vùng riêng của Unicode, không dùng thẻ HTML: giao diện tách chuỗi theo hai ký tự
# này và tự dựng <mark>, nên nội dung văn bản không bao giờ được chèn dưới dạng HTML.
MO, DONG = "\ue000", "\ue001"
UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
DO_DAI = {"tieu_de": 300, "so_ky_hieu": 60, "tom_tat": 1000, "noi_dung": 100000}


class LoiDuLieu(ValueError):
    pass


def _chu(gia_tri, ten, bat_buoc):
    if gia_tri is None:
        if bat_buoc:
            raise LoiDuLieu(f"Thiếu {ten}")
        return None
    if not isinstance(gia_tri, str):
        raise LoiDuLieu(f"{ten} phải là chuỗi")
    v = gia_tri.strip()
    if bat_buoc and not v:
        raise LoiDuLieu(f"Thiếu {ten}")
    if len(v) > DO_DAI[ten]:
        raise LoiDuLieu(f"{ten} dài quá {DO_DAI[ten]} ký tự")
    return v or None


def kiem_du_lieu(body, moi):
    """Body JSON của POST /files/wiki (moi=True, đủ trường bắt buộc) hoặc POST /files/wiki/{id} (chỉ trường gửi lên)
    → dict cột hợp lệ để ghi. Trường lạ → lỗi. Quyền (ai được ghi phạm vi nào) do RLS của CSDL quyết định."""
    if not isinstance(body, dict):
        raise LoiDuLieu("Body phải là object JSON")
    la = sorted(set(body) - set(TRUONG_GHI))
    if la:
        raise LoiDuLieu(f"Trường không ghi được: {', '.join(la)}")
    if not moi and not body:
        raise LoiDuLieu("Không có trường nào để sửa")
    dong = {}
    for ten in ("tieu_de", "noi_dung"):
        if moi or ten in body:
            dong[ten] = _chu(body.get(ten), ten, True)
    if dong.get("tieu_de") is not None and len(dong["tieu_de"]) < 3:
        raise LoiDuLieu("tieu_de cần ít nhất 3 ký tự")
    for ten in ("so_ky_hieu", "tom_tat"):
        if ten in body:
            dong[ten] = _chu(body.get(ten), ten, False)
    if moi or "loai" in body:
        if body.get("loai") not in LOAI:
            raise LoiDuLieu(f"loai phải là một trong: {', '.join(LOAI)}")
        dong["loai"] = body["loai"]
    if "ngay_ban_hanh" in body:
        v = body["ngay_ban_hanh"]
        if v in (None, ""):
            dong["ngay_ban_hanh"] = None
        else:
            try:
                dong["ngay_ban_hanh"] = datetime.date.fromisoformat(v).isoformat()
            except (TypeError, ValueError):
                raise LoiDuLieu("ngay_ban_hanh phải dạng YYYY-MM-DD") from None
    if moi or "pham_vi" in body or "linh_vuc_id" in body:
        pham_vi = body.get("pham_vi", "toan_xa" if moi else None)
        if "pham_vi" in body or moi:
            if pham_vi not in PHAM_VI:
                raise LoiDuLieu(f"pham_vi phải là một trong: {', '.join(PHAM_VI)}")
            dong["pham_vi"] = pham_vi
        lv = body.get("linh_vuc_id")
        if lv is not None and not (isinstance(lv, str) and UUID_RE.match(lv)):
            raise LoiDuLieu("linh_vuc_id phải là UUID")
        if pham_vi is not None:
            if (pham_vi == "linh_vuc") != (lv is not None):
                raise LoiDuLieu("Phạm vi lĩnh vực cần linh_vuc_id; phạm vi khác không kèm lĩnh vực")
            dong["linh_vuc_id"] = lv
        elif "linh_vuc_id" in body:
            dong["linh_vuc_id"] = lv
    if "trang_thai" in body:
        if body["trang_thai"] not in ("hieu_luc", "het_hieu_luc"):
            raise LoiDuLieu("trang_thai phải là hieu_luc hoặc het_hieu_luc")
        dong["trang_thai"] = body["trang_thai"]
    return dong


def tai_lieu(dong):
    """Dòng CSDL → tài liệu Meilisearch (sua_luc_giay để sắp xếp khi không có từ khóa)."""
    doc = {k: dong.get(k) for k in ("id", "tieu_de", "loai", "so_ky_hieu", "ngay_ban_hanh", "tom_tat", "noi_dung",
                                    "pham_vi", "linh_vuc_id", "trang_thai", "phien_ban", "sua_luc")}
    try:
        doc["sua_luc_giay"] = int(datetime.datetime.fromisoformat(str(dong.get("sua_luc"))).timestamp())
    except ValueError:
        doc["sua_luc_giay"] = 0
    return doc


def bo_loc(vai, linh_vuc_ids, loai=None, tat_ca=False):
    """Bộ lọc Meilisearch đúng như policy RLS của bảng: lãnh đạo thấy hết; văn thư mọi phạm vi trừ lanh_dao; cán bộ
    toàn xã và lĩnh vực đang phụ trách. None = vai không đọc được wiki."""
    if vai not in VAI_DOC:
        return None
    phan = []
    if vai == "van_thu":
        phan.append('pham_vi != "lanh_dao"')
    elif vai == "can_bo":
        ids = [i for i in linh_vuc_ids if UUID_RE.match(str(i))]
        if ids:
            phan.append(f'(pham_vi = "toan_xa" OR (pham_vi = "linh_vuc" AND linh_vuc_id IN {json.dumps(ids)}))')
        else:
            phan.append('pham_vi = "toan_xa"')
    if not tat_ca:
        phan.append('trang_thai = "hieu_luc"')
    if loai:
        phan.append(f"loai = {json.dumps(loai)}")
    return " AND ".join(phan)


def _trich(chu, q, do_dai=220):
    """Đoạn trích quanh từ khóa đầu tiên khớp (dùng khi tìm dự phòng trong CSDL, không có đánh dấu của Meilisearch)."""
    chu = " ".join((chu or "").split())
    vi_tri = -1
    for tu in (q or "").lower().split():
        vi_tri = chu.lower().find(tu)
        if vi_tri >= 0:
            break
    dau = max(0, vi_tri - do_dai // 3) if vi_tri >= 0 else 0
    doan = chu[dau:dau + do_dai]
    return ("…" if dau else "") + doan + ("…" if dau + do_dai < len(chu) else "")


def ket_qua_meili(hit):
    """Hit của Meilisearch (có _formatted) → kết quả trả giao diện: các cột + tiêu đề và đoạn trích có đánh dấu."""
    f = hit.get("_formatted") or {}
    kq = {k: hit.get(k) for k in COT_KET_QUA}
    kq["tieu_de_danh_dau"] = f.get("tieu_de") or hit.get("tieu_de")
    kq["trich_doan"] = f.get("noi_dung") or _trich(hit.get("noi_dung"), "")
    return kq


def ket_qua_csdl(dong, q):
    kq = {k: dong.get(k) for k in COT_KET_QUA}
    kq["tieu_de_danh_dau"] = dong.get("tieu_de")
    kq["trich_doan"] = _trich(dong.get("noi_dung"), q)
    return kq


def than_tim(q, bo_loc_meili, so_luong, offset):
    """Body POST /indexes/{index}/search."""
    body = {"q": q, "filter": bo_loc_meili, "limit": so_luong, "offset": offset,
            "attributesToRetrieve": list(COT_KET_QUA) + ["noi_dung"],
            "attributesToHighlight": ["tieu_de", "noi_dung"], "attributesToCrop": ["noi_dung"], "cropLength": 40,
            "cropMarker": "…", "highlightPreTag": MO, "highlightPostTag": DONG}
    if not q:
        body["sort"] = ["sua_luc_giay:desc"]
    return body


class Kho:
    """Chỉ mục wiki trên Meilisearch. meili: đối tượng có goi(method, duong, body, cho_phep, timeout) và
    cho_tac_vu(uid) như tri_thuc.Meili; lỗi → tri_thuc.LoiKhoTriThuc."""

    def __init__(self, meili):
        self.meili = meili

    def dam_bao_index(self):
        status, _ = self.meili.goi("GET", "/indexes/{index}", cho_phep=(404,))
        if status == 404:
            _, t = self.meili.goi("POST", "/indexes", {"uid": self.meili.cfg()["index"], "primaryKey": "id"})
            self.meili.cho_tac_vu(t["taskUid"])
        _, t = self.meili.goi("PATCH", "/indexes/{index}/settings", CAI_DAT_INDEX)
        self.meili.cho_tac_vu(t["taskUid"])

    def cap_nhat(self, dong, cho_giay=15):
        _, t = self.meili.goi("POST", "/indexes/{index}/documents", [tai_lieu(dong)])
        self.meili.cho_tac_vu(t["taskUid"], toi_da_giay=cho_giay)

    def dong_bo(self, cac_dong):
        """Dựng lại chỉ mục từ toàn bộ dòng CSDL: thêm/cập nhật tất cả, xóa tài liệu không còn trong CSDL."""
        self.dam_bao_index()
        if cac_dong:
            _, t = self.meili.goi("POST", "/indexes/{index}/documents", [tai_lieu(d) for d in cac_dong])
            self.meili.cho_tac_vu(t["taskUid"])
        con = {d["id"] for d in cac_dong}
        thua, offset = [], 0
        while True:
            _, data = self.meili.goi("GET", f"/indexes/{{index}}/documents?fields=id&limit=1000&offset={offset}")
            ket = (data or {}).get("results") or []
            thua += [r["id"] for r in ket if r["id"] not in con]
            if len(ket) < 1000:
                break
            offset += 1000
        if thua:
            _, t = self.meili.goi("POST", "/indexes/{index}/documents/delete-batch", thua)
            self.meili.cho_tac_vu(t["taskUid"])
        return {"so_tai_lieu": len(cac_dong), "da_xoa": len(thua)}

    def tim(self, q, bo_loc_meili, so_luong=20, offset=0):
        _, data = self.meili.goi("POST", "/indexes/{index}/search", than_tim(q, bo_loc_meili, so_luong, offset),
                                 timeout=10)
        data = data or {}
        return data.get("hits") or [], data.get("estimatedTotalHits", 0)
