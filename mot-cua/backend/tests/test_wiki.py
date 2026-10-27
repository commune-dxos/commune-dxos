# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Test wiki văn bản nội bộ cho cán bộ (#95): kiểm dữ liệu ghi (wiki.py), bộ lọc Meilisearch đúng như RLS theo
vai/lĩnh vực, tài liệu chỉ mục, đoạn trích, đồng bộ chỉ mục (thêm, xóa tài liệu thừa); endpoint của main.py: vai
được tìm/ghi, kết quả chỉ mục bị đối chiếu lại với RLS, Meilisearch lỗi → tìm trong CSDL, ghi xong cập nhật chỉ mục,
lỗi quyền của CSDL → 403. PostgREST và Meilisearch là đối tượng giả. Không cần Docker.

Chạy: make test-backend
"""

import logging
import os
import sys
import unittest
from unittest import mock

os.environ.setdefault("DXOS_JWT_ISSUER", "http://localhost:8080/realms/dxos")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import main  # noqa: E402
import tri_thuc  # noqa: E402
import wiki  # noqa: E402

logging.disable(logging.CRITICAL)

LV_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
LV_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
ID1 = "11111111-1111-4111-8111-111111111111"
ID2 = "22222222-2222-4222-8222-222222222222"


def claims(vai, sub="sub-nguoi-dung"):
    return {"sub": sub, "resource_access": {"dxos_api": {"roles": [vai]}}}


class Req:
    def __init__(self, **query):
        self.query = query


def dong(i, **k):
    return {"id": i, "tieu_de": "Quy chế làm việc", "loai": "quy_che", "so_ky_hieu": None, "ngay_ban_hanh": None,
            "tom_tat": None, "noi_dung": "Nội dung quy chế tiếp công dân.", "pham_vi": "toan_xa", "linh_vuc_id": None,
            "trang_thai": "hieu_luc", "phien_ban": 1, "nguoi_sua_sub": "vt", "sua_luc": "2026-10-26T10:00:00+07:00",
            **k}


class KiemDuLieu(unittest.TestCase):
    def test_them_toi_thieu(self):
        self.assertEqual(wiki.kiem_du_lieu({"tieu_de": "  Quy chế  ", "loai": "quy_che", "noi_dung": "abc"}, True),
                         {"tieu_de": "Quy chế", "noi_dung": "abc", "loai": "quy_che", "pham_vi": "toan_xa",
                          "linh_vuc_id": None})

    def test_them_linh_vuc(self):
        d = wiki.kiem_du_lieu({"tieu_de": "Hướng dẫn", "loai": "huong_dan", "noi_dung": "x", "pham_vi": "linh_vuc",
                               "linh_vuc_id": LV_A, "ngay_ban_hanh": "2026-03-02", "so_ky_hieu": "05/HD"}, True)
        self.assertEqual((d["pham_vi"], d["linh_vuc_id"], d["ngay_ban_hanh"]), ("linh_vuc", LV_A, "2026-03-02"))

    def test_loi(self):
        sai = [
            ({"loai": "quy_che", "noi_dung": "x"}, "Thiếu tieu_de"),
            ({"tieu_de": "ab", "loai": "quy_che", "noi_dung": "x"}, "ít nhất 3"),
            ({"tieu_de": "Quy chế", "loai": "la", "noi_dung": "x"}, "loai"),
            ({"tieu_de": "Quy chế", "loai": "quy_che", "noi_dung": "  "}, "Thiếu noi_dung"),
            ({"tieu_de": "Quy chế", "loai": "quy_che", "noi_dung": "x", "pham_vi": "linh_vuc"}, "linh_vuc_id"),
            ({"tieu_de": "Quy chế", "loai": "quy_che", "noi_dung": "x", "linh_vuc_id": LV_A}, "Phạm vi"),
            ({"tieu_de": "Quy chế", "loai": "quy_che", "noi_dung": "x", "pham_vi": "linh_vuc", "linh_vuc_id": "1"},
             "UUID"),
            ({"tieu_de": "Quy chế", "loai": "quy_che", "noi_dung": "x", "ngay_ban_hanh": "02/03/2026"}, "YYYY-MM-DD"),
            ({"tieu_de": "Quy chế", "loai": "quy_che", "noi_dung": "x", "nguoi_tao_sub": "khac"}, "không ghi được"),
            ({"tieu_de": "Quy chế", "loai": "quy_che", "noi_dung": "x" * 100001}, "dài quá"),
            ({"tieu_de": 5, "loai": "quy_che", "noi_dung": "x"}, "chuỗi"),
        ]
        for body, thong_diep in sai:
            with self.subTest(body=str(body)[:60]), self.assertRaisesRegex(wiki.LoiDuLieu, thong_diep):
                wiki.kiem_du_lieu(body, True)

    def test_sua_chi_truong_gui(self):
        self.assertEqual(wiki.kiem_du_lieu({"trang_thai": "het_hieu_luc"}, False), {"trang_thai": "het_hieu_luc"})
        self.assertEqual(wiki.kiem_du_lieu({"pham_vi": "toan_xa"}, False), {"pham_vi": "toan_xa", "linh_vuc_id": None})
        self.assertEqual(wiki.kiem_du_lieu({"ngay_ban_hanh": ""}, False), {"ngay_ban_hanh": None})
        with self.assertRaisesRegex(wiki.LoiDuLieu, "Không có trường"):
            wiki.kiem_du_lieu({}, False)
        with self.assertRaisesRegex(wiki.LoiDuLieu, "trang_thai"):
            wiki.kiem_du_lieu({"trang_thai": "xoa"}, False)


class BoLoc(unittest.TestCase):
    def test_theo_vai(self):
        self.assertEqual(wiki.bo_loc("lanh_dao", []), 'trang_thai = "hieu_luc"')
        self.assertEqual(wiki.bo_loc("lanh_dao", [], tat_ca=True), "")
        self.assertEqual(wiki.bo_loc("van_thu", [], loai="quy_che"),
                         'pham_vi != "lanh_dao" AND trang_thai = "hieu_luc" AND loai = "quy_che"')
        self.assertEqual(wiki.bo_loc("can_bo", [LV_A, LV_B]),
                         f'(pham_vi = "toan_xa" OR (pham_vi = "linh_vuc" AND linh_vuc_id IN ["{LV_A}", "{LV_B}"])) '
                         'AND trang_thai = "hieu_luc"')
        self.assertEqual(wiki.bo_loc("can_bo", []), 'pham_vi = "toan_xa" AND trang_thai = "hieu_luc"')
        self.assertIsNone(wiki.bo_loc("cong_dan", []))
        self.assertIsNone(wiki.bo_loc(None, []))

    def test_khong_tiem_bo_loc(self):
        # id lĩnh vực lạ (không phải UUID) bị bỏ; loại đã kiểm trong danh mục trước khi tới đây và được JSON hóa.
        self.assertEqual(wiki.bo_loc("can_bo", ['x" OR pham_vi = "lanh_dao']), 'pham_vi = "toan_xa" AND trang_thai = "hieu_luc"')


class TaiLieuTrich(unittest.TestCase):
    def test_tai_lieu(self):
        d = wiki.tai_lieu(dong(ID1))
        import datetime
        self.assertEqual(d["sua_luc_giay"], int(datetime.datetime(2026, 10, 26, 3, tzinfo=datetime.timezone.utc).timestamp()))
        self.assertNotIn("nguoi_sua_sub", d)

    def test_trich(self):
        chu = "Mở đầu. " + "a " * 200 + "giờ tiếp công dân là 7 giờ 30." + " b" * 200
        t = wiki._trich(chu, "tiếp công dân")
        self.assertIn("tiếp công dân", t)
        self.assertTrue(t.startswith("…") and t.endswith("…"))
        self.assertEqual(wiki._trich("ngắn", "x"), "ngắn")

    def test_ket_qua_meili(self):
        hit = {**dong(ID1), "_formatted": {"tieu_de": f"{wiki.MO}Quy chế{wiki.DONG} làm việc", "noi_dung": "…đoạn…"}}
        kq = wiki.ket_qua_meili(hit)
        self.assertEqual((kq["tieu_de_danh_dau"], kq["trich_doan"]), (f"{wiki.MO}Quy chế{wiki.DONG} làm việc", "…đoạn…"))
        self.assertNotIn("noi_dung", kq)

    def test_than_tim(self):
        self.assertEqual(wiki.than_tim("", "f", 20, 0)["sort"], ["sua_luc_giay:desc"])
        b = wiki.than_tim("quy chế", "f", 5, 10)
        self.assertNotIn("sort", b)
        self.assertEqual((b["filter"], b["limit"], b["offset"], b["highlightPreTag"]), ("f", 5, 10, wiki.MO))


class MeiliGia:
    """Giả lập các lời gọi tri_thuc.Meili mà wiki.Kho dùng."""

    def __init__(self, tai_lieu=None, hits=None, loi=False):
        self.docs = {d["id"]: d for d in (tai_lieu or [])}
        self.hits, self.loi, self.goi_ = hits or [], loi, []
        self.co_index = bool(tai_lieu)

    def cfg(self):
        return {"index": "mot-cua-wiki-van-ban"}

    def cho_tac_vu(self, uid, toi_da_giay=120):
        return {"status": "succeeded"}

    def goi(self, method, duong, body=None, cho_phep=(), timeout=15):
        if self.loi:
            raise tri_thuc.LoiKhoTriThuc("Meilisearch tắt")
        self.goi_.append((method, duong.split("?")[0], body))
        if method == "GET" and duong == "/indexes/{index}":
            return (200 if self.co_index else 404), {}
        if method == "GET" and duong.startswith("/indexes/{index}/documents"):
            return 200, {"results": [{"id": i} for i in self.docs]}
        if method == "POST" and duong == "/indexes/{index}/documents":
            self.docs.update({d["id"]: d for d in body})
        if method == "POST" and duong.endswith("/delete-batch"):
            for i in body:
                self.docs.pop(i, None)
        if method == "POST" and duong.endswith("/search"):
            return 200, {"hits": self.hits, "estimatedTotalHits": len(self.hits)}
        return 202, {"taskUid": 1}


class DongBo(unittest.TestCase):
    def test_tao_index_them_xoa_thua(self):
        m = MeiliGia()
        m.docs = {"cu": {"id": "cu"}}
        kq = wiki.Kho(m).dong_bo([dong(ID1), dong(ID2)])
        self.assertEqual(kq, {"so_tai_lieu": 2, "da_xoa": 1})
        self.assertEqual(set(m.docs), {ID1, ID2})
        self.assertIn(("POST", "/indexes", {"uid": "mot-cua-wiki-van-ban", "primaryKey": "id"}), m.goi_)
        self.assertIn(("PATCH", "/indexes/{index}/settings", wiki.CAI_DAT_INDEX), m.goi_)


class Endpoint(unittest.TestCase):
    def setUp(self):
        self.goi = []
        self.rls = {ID1}            # id người gọi thấy theo RLS
        self.loi_ghi = None
        self.meili = MeiliGia(hits=[{**dong(ID1), "_formatted": {}}, {**dong(ID2), "_formatted": {}}])
        p = [mock.patch.object(main, "pgrst", self._pgrst), mock.patch.object(main, "WIKI", wiki.Kho(self.meili)),
             mock.patch.object(main.DICH_VU_TEP, "lay", return_value="tk-dv")]
        for x in p:
            x.start()
            self.addCleanup(x.stop)

    def _pgrst(self, token, method, path, body=None, prefer=None):
        self.goi.append((token, method, path.split("?")[0], body))
        if path.startswith("/can_bo?"):
            return [{"linh_vuc": [{"id": LV_A}]}]
        if method == "GET" and path.startswith("/wiki_van_ban?id=in."):
            return [{"id": i} for i in self.rls]
        if path == "/rpc/tim_wiki":
            return [dong(ID1, noi_dung="Quy chế tiếp công dân của xã."), dong(ID2, loai="huong_dan")]
        if method in ("POST", "PATCH") and path.startswith("/wiki_van_ban"):
            if self.loi_ghi:
                raise main.Loi(*self.loi_ghi)
            return [] if "id=eq.00000000" in path else [dong(ID1, **body)]
        if method == "GET" and path.startswith("/wiki_van_ban?select="):
            return [dong(ID1)]
        raise AssertionError(path)

    def test_vai_khong_duoc_tim(self):
        for vai in ("cong_dan", None):
            with self.subTest(vai=vai), self.assertRaises(main.Loi) as cm:
                main.tim_wiki("tk", claims(vai), Req(q="quy chế"))
            self.assertEqual(cm.exception.status, 403)

    def test_can_bo_tim_loc_theo_linh_vuc_va_doi_chieu_rls(self):
        st, kq = main.tim_wiki("tk", claims("can_bo"), Req(q="quy chế"))
        self.assertEqual(st, 200)
        self.assertEqual([k["id"] for k in kq["ket_qua"]], [ID1])  # ID2 có trong chỉ mục nhưng RLS không cho
        self.assertEqual((kq["nguon"], kq["tong"]), ("meilisearch", 1))
        tim = [b for m, d, b in self.meili.goi_ if d.endswith("/search")][0]
        self.assertIn(LV_A, tim["filter"])
        self.assertEqual(tim["q"], "quy chế")

    def test_lanh_dao_khong_tra_cuu_linh_vuc(self):
        self.rls = {ID1, ID2}
        _, kq = main.tim_wiki("tk", claims("lanh_dao"), Req(q="", tat_ca="1", loai="quy_che"))
        self.assertEqual(len(kq["ket_qua"]), 2)
        self.assertFalse([g for g in self.goi if g[2] == "/can_bo"])
        tim = [b for m, d, b in self.meili.goi_ if d.endswith("/search")][0]
        self.assertEqual((tim["filter"], tim["sort"]), ('loai = "quy_che"', ["sua_luc_giay:desc"]))

    def test_tham_so_sai(self):
        for q in ({"q": "x" * 201}, {"loai": "la"}, {"so_luong": "nhieu"}):
            with self.subTest(q=q), self.assertRaises(main.Loi) as cm:
                main.tim_wiki("tk", claims("can_bo"), Req(**q))
            self.assertEqual(cm.exception.status, 400)

    def test_meili_loi_tim_trong_csdl(self):
        self.meili.loi = True
        _, kq = main.tim_wiki("tk", claims("van_thu"), Req(q="tiếp công dân", loai="quy_che"))
        self.assertEqual(kq["nguon"], "csdl")
        self.assertEqual([k["id"] for k in kq["ket_qua"]], [ID1])  # ID2 khác loại bị lọc
        self.assertIn("tiếp công dân", kq["ket_qua"][0]["trich_doan"])
        rpc = [g for g in self.goi if g[2] == "/rpc/tim_wiki"][0]
        self.assertEqual((rpc[0], rpc[3]["p_q"]), ("tk", "tiếp công dân"))  # token của người gọi: RLS áp dụng

    def test_ghi_chi_van_thu_lanh_dao(self):
        for vai in ("can_bo", "cong_dan"):
            with self.subTest(vai=vai), self.assertRaises(main.Loi) as cm:
                main.ghi_wiki("tk", claims(vai), {"tieu_de": "Quy chế", "loai": "quy_che", "noi_dung": "x"})
            self.assertEqual(cm.exception.status, 403)

    def test_them_ghi_bang_token_nguoi_goi_va_cap_nhat_chi_muc(self):
        st, moi = main.ghi_wiki("tk-vt", claims("van_thu"), {"tieu_de": "Quy chế mới", "loai": "quy_che",
                                                             "noi_dung": "Nội dung"})
        self.assertEqual((st, moi["tieu_de"]), (201, "Quy chế mới"))
        ghi = [g for g in self.goi if g[1] == "POST" and g[2] == "/wiki_van_ban"][0]
        self.assertEqual(ghi[0], "tk-vt")
        self.assertEqual(self.meili.docs[ID1]["tieu_de"], "Quy chế mới")

    def test_sua_va_loi(self):
        st, _ = main.ghi_wiki("tk", claims("lanh_dao"), {"trang_thai": "het_hieu_luc"}, ID1)
        self.assertEqual(st, 200)
        with self.assertRaises(main.Loi) as cm:
            main.ghi_wiki("tk", claims("lanh_dao"), {"trang_thai": "het_hieu_luc"},
                          "00000000-0000-4000-8000-000000000000")
        self.assertEqual(cm.exception.status, 404)
        with self.assertRaises(main.Loi) as cm:
            main.ghi_wiki("tk", claims("lanh_dao"), {"loai": "x"}, ID1)
        self.assertEqual(cm.exception.status, 400)
        self.loi_ghi = (403, "new row violates row-level security policy", {"code": "42501"})
        with self.assertRaises(main.Loi) as cm:
            main.ghi_wiki("tk", claims("van_thu"), {"pham_vi": "lanh_dao"}, ID1)
        self.assertEqual((cm.exception.status, cm.exception.thong_diep), (403, "Không có quyền ghi văn bản ở phạm vi này"))

    def test_ghi_khi_meili_tat_van_luu(self):
        self.meili.loi = True
        st, _ = main.ghi_wiki("tk", claims("van_thu"), {"tieu_de": "Quy chế", "loai": "quy_che", "noi_dung": "x"})
        self.assertEqual(st, 201)

    def test_dong_bo_bang_tai_khoan_dich_vu(self):
        self.meili.co_index = True
        self.assertEqual(main.dong_bo_wiki(), {"so_tai_lieu": 1, "da_xoa": 0})
        self.assertEqual(self.goi[-1][0], "tk-dv")


if __name__ == "__main__":
    unittest.main()
