# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Test Poka-yoke phía máy chủ (#59): poka_yoke.py (dựng tài liệu hồ sơ, kiểm JSON Schema 2020-12
bằng jsonschema) và endpoint khởi tạo quy trình của main.py qua HTTP thật, với PostgREST, Flowable,
hộp thư đi giả. Schema lấy đúng từ thu-tuc/<gói>/thanh-phan-ho-so.schema.json. Không cần Docker.

Chạy: make test-backend   (cần jsonschema: mot-cua/backend/requirements.txt)
"""

import copy
import json
import logging
import os
import sys
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from unittest import mock

os.environ.setdefault("DXOS_JWT_ISSUER", "http://localhost:8080/realms/dxos")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import main  # noqa: E402
import poka_yoke  # noqa: E402

logging.disable(logging.CRITICAL)
GOC = os.path.join(os.path.dirname(__file__), "..", "..", "..", "thu-tuc")


def schema_goi(goi):
    with open(os.path.join(GOC, goi, "thanh-phan-ho-so.schema.json"), encoding="utf-8") as f:
        return json.load(f)


KS = schema_goi("khai-sinh")
CT = schema_goi("chung-thuc-ban-sao")
SUB = "sub-cong-dan-1"
HS_ID = "7e570000-0000-4000-8000-0000000000a1"
TT_ID = "7e570000-0000-4000-8000-0000000000b1"


def tep(i, ma, sach=True, object_key=True):
    return {"id": f"5a1e0000-0000-4000-8000-{i:012d}", "ket_qua_quet": "sach" if sach else None,
            "object_key": f"ho-so/x/{i}.pdf" if object_key else None,
            "thanh_phan_yeu_cau": {"ma": ma} if ma else None}


TEP_KS_DU = [tep(1, "to_khai"), tep(2, "giay_chung_sinh"), tep(3, "giay_to_tuy_than")]


class DungTaiLieu(unittest.TestCase):
    def test_gom_tep_sach_theo_thanh_phan(self):
        doc, chua = poka_yoke.tai_lieu({"ho_ten_nguoi_nop": "Nguyễn Văn Mẫu", "so_dien_thoai": None},
                                       TEP_KS_DU + [tep(4, "to_khai"), tep(5, None)])
        self.assertEqual(doc["ho_so"], {"ho_ten_nguoi_nop": "Nguyễn Văn Mẫu"})
        self.assertEqual(doc["thanh_phan"]["to_khai"], [TEP_KS_DU[0]["id"], tep(4, "to_khai")["id"]])
        self.assertEqual(sorted(doc["thanh_phan"]), ["giay_chung_sinh", "giay_to_tuy_than", "to_khai"])
        self.assertEqual(chua, set())

    def test_tep_chua_quet_sach_hoac_chua_luu_khong_tinh(self):
        doc, chua = poka_yoke.tai_lieu({}, [tep(1, "to_khai", sach=False), tep(2, "ban_sao", object_key=False),
                                            tep(3, "giay_chung_sinh"), tep(4, "giay_chung_sinh", sach=False)])
        self.assertEqual(doc["thanh_phan"], {"giay_chung_sinh": [tep(3, "x")["id"]]})
        self.assertEqual(chua, {"to_khai", "ban_sao"})  # giay_chung_sinh đã có tệp sạch


class KiemSchema(unittest.TestCase):
    def test_du_thanh_phan_ks01_ct01(self):
        self.assertEqual(poka_yoke.kiem(KS, poka_yoke.tai_lieu({}, TEP_KS_DU)[0]), [])
        self.assertEqual(poka_yoke.kiem(CT, {"thanh_phan": {"ban_chinh": [tep(1, "x")["id"]]}}), [])

    def test_du_lieu_mau_cua_goi_hop_le(self):
        for goi, schema in (("khai-sinh", KS), ("chung-thuc-ban-sao", CT)):
            with open(os.path.join(GOC, goi, "du-lieu-mau.json"), encoding="utf-8") as f:
                mau = json.load(f)
            with self.subTest(goi=goi):
                self.assertEqual(poka_yoke.kiem(schema, {"ho_so": mau["ho_so"], "thanh_phan": mau["thanh_phan"]}), [])

    def test_thieu_thanh_phan_bat_buoc_bao_tung_cai_tieng_viet(self):
        loi = poka_yoke.kiem(KS, {"thanh_phan": {"to_khai": [tep(1, "x")["id"]]}})
        self.assertEqual([(l["thanhPhan"], l["loi"]) for l in loi],
                         [("giay_chung_sinh", "Thiếu thành phần bắt buộc"),
                          ("giay_to_tuy_than", "Thiếu thành phần bắt buộc")])
        self.assertEqual(loi[0]["ten"], KS["properties"]["thanh_phan"]["properties"]["giay_chung_sinh"]["title"])

    def test_thieu_vi_tep_chua_sach_noi_ro(self):
        loi = poka_yoke.kiem(CT, {"thanh_phan": {}}, {"ban_chinh"})
        self.assertEqual(loi, [{"thanhPhan": "ban_chinh", "ten": "Bản chính giấy tờ cần chứng thực",
                                "loi": "Tệp đã nộp chưa được quét sạch, chưa tính là đã nộp"}])

    def test_mang_rong_id_sai_thanh_phan_la(self):
        loi = poka_yoke.kiem(CT, {"thanh_phan": {"ban_chinh": [], "ban_sao": ["khong-phai-uuid"], "la": ["x"]}})
        self.assertEqual(sorted((l["thanhPhan"], l["loi"]) for l in loi), [
            ("ban_chinh", "Cần ít nhất 1 tệp"),
            ("ban_sao", "Dữ liệu thành phần không hợp lệ"),
            ("la", "Thành phần không thuộc thủ tục này")])

    def test_thieu_khoa_thanh_phan(self):
        self.assertEqual(poka_yoke.kiem(KS, {})[0]["loi"], "Thiếu trường bắt buộc: thanh_phan")

    def test_schema_hong_la_loi_cau_hinh(self):
        with self.assertRaises(poka_yoke.LoiSchema):
            poka_yoke.kiem({"type": "khong-co-kieu-nay"}, {})


class CsdlGia:
    """PostgREST + Flowable + hộp thư đi giả; ghi lại các lời gọi để kiểm."""

    def __init__(self, schema=KS, ds_tep=(), trang_thai="moi", co_quy_trinh=False, co_thu_tuc=True):
        self.schema, self.ds_tep, self.trang_thai = schema, list(ds_tep), trang_thai
        self.co_quy_trinh, self.co_thu_tuc = co_quy_trinh, co_thu_tuc
        self.flowable_post, self.su_kien, self.ho_so_moi = [], [], []

    def ho_so(self):
        return {"id": HS_ID, "ma_ho_so": "HS20261023-000001", "trang_thai": self.trang_thai,
                "han_xu_ly": "2026-10-28", "nguoi_nop_sub": SUB, "ho_ten_nguoi_nop": "Nguyễn Văn Mẫu",
                "so_dien_thoai": "0900000001",
                "thu_tuc": {"ma": "KS01", "quy_trinh": "dang_ky_khai_sinh", "json_schema": copy.deepcopy(self.schema),
                            "trang_thai_buoc": {"tiep_nhan": "moi", "tham_dinh": "dang_xu_ly"}}}

    def pgrst(self, token, method, path, body=None, prefer=None):
        if method == "GET" and path.startswith("/ho_so?id=eq."):
            return [self.ho_so()] if HS_ID in path else []
        if method == "GET" and path.startswith("/thanh_phan_ho_so?ho_so_id=eq."):
            return copy.deepcopy(self.ds_tep)
        if method == "GET" and path.startswith("/thu_tuc?id=eq."):
            return [{"ma": "KS01", "quy_trinh": "dang_ky_khai_sinh", "json_schema": self.schema}] if self.co_thu_tuc else []
        if method == "POST" and path.startswith("/ho_so"):
            self.ho_so_moi.append(body)
            return [self.ho_so()]
        raise AssertionError(f"PostgREST giả không biết {method} {path}")

    def ngu_canh(self, ids):
        return {HS_ID: {"id": HS_ID, "ma_ho_so": "HS20261023-000001", "trang_thai": self.trang_thai,
                        "thu_tuc": {"ma": "KS01", "linh_vuc": {"ma": "ho_tich"}}}}

    def dong_bo(self, ho_so_id, trang_thai_moi, cac_su_kien, **kw):
        self.su_kien += [(ev["loai"], ho_so_id, trang_thai_moi) for ev, _ in cac_su_kien]
        return {"trangThai": trang_thai_moi or self.trang_thai, "daDoi": bool(trang_thai_moi)}

    def flowable(self, method, path, body=None, cho_phep=()):
        if path.startswith("/history/historic-process-instances"):
            return 200, {"data": [{"id": "p0"}] if self.co_quy_trinh else []}
        if method == "POST" and path == "/runtime/process-instances":
            self.flowable_post.append(body)
            return 201, {"id": "pi-1"}
        if path.startswith("/runtime/tasks?processInstanceId="):
            return 200, {"data": [{"id": "t1", "taskDefinitionKey": "tiep_nhan", "name": "Tiếp nhận"}]}
        raise AssertionError(f"Flowable giả không biết {method} {path}")


class KhoiTaoQuaHttp(unittest.TestCase):
    """POST /ho-so/{id}/khoi-tao và POST /ho-so qua máy chủ HTTP thật của main.py (cổng ngẫu nhiên)."""

    @classmethod
    def setUpClass(cls):
        cls.may = ThreadingHTTPServer(("127.0.0.1", 0), main.Handler)
        threading.Thread(target=cls.may.serve_forever, daemon=True).start()
        cls.goc = f"http://127.0.0.1:{cls.may.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.may.shutdown()
        cls.may.server_close()

    def goi(self, csdl, duong, body=None):
        claims = {"sub": SUB, "resource_access": {"dxos_api": {"roles": ["cong_dan"]}}}
        req = urllib.request.Request(self.goc + duong, data=json.dumps(body or {}).encode(), method="POST",
                                     headers={"Authorization": "Bearer x", "Content-Type": "application/json"})
        with mock.patch.object(main, "kiem_token", return_value=("tk", claims)), \
                mock.patch.object(main, "pgrst", csdl.pgrst), mock.patch.object(main, "flowable", csdl.flowable), \
                mock.patch.object(main.hop_thu, "ngu_canh", csdl.ngu_canh), \
                mock.patch.object(main.hop_thu, "dong_bo", csdl.dong_bo):
            try:
                with urllib.request.urlopen(req, timeout=5) as r:
                    return r.status, json.loads(r.read())
            except urllib.error.HTTPError as e:
                with e:
                    return e.code, json.loads(e.read())

    def khoi_tao(self, csdl):
        return self.goi(csdl, f"/ho-so/{HS_ID}/khoi-tao")

    def test_du_thanh_phan_201_goi_flowable_ghi_su_kien(self):
        csdl = CsdlGia(ds_tep=TEP_KS_DU)
        status, data = self.khoi_tao(csdl)
        self.assertEqual(status, 201)
        self.assertEqual(data["processInstanceId"], "pi-1")
        self.assertEqual(len(csdl.flowable_post), 1)
        # Bước đầu (tiep_nhan) khai "moi" trong gói: chỉ ghi sự kiện, không đổi trạng thái (#73).
        self.assertEqual(csdl.su_kien, [("ho_so.moi", HS_ID, None)])
        self.assertEqual(data["trangThai"], "moi")

    def test_ct01_du_ban_chinh_201(self):
        csdl = CsdlGia(schema=CT, ds_tep=[tep(1, "ban_chinh")])
        self.assertEqual(self.khoi_tao(csdl)[0], 201)

    def test_thieu_mot_thanh_phan_422_khong_khoi_tao_khong_ghi_su_kien(self):
        csdl = CsdlGia(ds_tep=TEP_KS_DU[:2])
        status, data = self.khoi_tao(csdl)
        self.assertEqual(status, 422)
        self.assertIn("Hồ sơ chưa đủ thành phần", data["loi"])
        self.assertEqual([(l["thanhPhan"], l["loi"]) for l in data["chiTiet"]["thanhPhan"]],
                         [("giay_to_tuy_than", "Thiếu thành phần bắt buộc")])
        self.assertEqual((csdl.flowable_post, csdl.su_kien), ([], []))

    def test_tep_chua_quet_sach_422(self):
        csdl = CsdlGia(ds_tep=TEP_KS_DU[:2] + [tep(3, "giay_to_tuy_than", sach=False)])
        status, data = self.khoi_tao(csdl)
        self.assertEqual(status, 422)
        self.assertEqual(data["chiTiet"]["thanhPhan"][0]["thanhPhan"], "giay_to_tuy_than")
        self.assertIn("chưa được quét sạch", data["chiTiet"]["thanhPhan"][0]["loi"])
        self.assertEqual((csdl.flowable_post, csdl.su_kien), ([], []))

    def test_khong_co_tep_nao_422_liet_ke_ca_ba(self):
        status, data = self.khoi_tao(CsdlGia())
        self.assertEqual(status, 422)
        self.assertEqual(len(data["chiTiet"]["thanhPhan"]), 3)

    def test_ho_so_khong_thay_404(self):
        status, _ = self.goi(CsdlGia(), "/ho-so/7e570000-0000-4000-8000-0000000000ff/khoi-tao")
        self.assertEqual(status, 404)

    def test_goi_trung_409_truoc_khi_kiem(self):
        csdl = CsdlGia(ds_tep=[], co_quy_trinh=True)
        self.assertEqual(self.khoi_tao(csdl)[0], 409)
        self.assertEqual(self.khoi_tao(CsdlGia(ds_tep=TEP_KS_DU, trang_thai="dang_xu_ly"))[0], 409)
        self.assertEqual(csdl.flowable_post, [])

    def test_nop_gop_thu_tuc_khong_ton_tai_404(self):
        status, _ = self.goi(CsdlGia(co_thu_tuc=False), "/ho-so", {"thu_tuc_id": TT_ID, "ho_ten_nguoi_nop": "X"})
        self.assertEqual(status, 404)

    def test_nop_gop_thu_tuc_can_giay_to_422_khong_luu_ho_so(self):
        csdl = CsdlGia()
        status, data = self.goi(csdl, "/ho-so", {"thu_tuc_id": TT_ID, "ho_ten_nguoi_nop": "X"})
        self.assertEqual(status, 422)
        self.assertEqual(len(data["chiTiet"]["thanhPhan"]), 3)
        self.assertEqual((csdl.ho_so_moi, csdl.flowable_post, csdl.su_kien), ([], [], []))

    def test_nop_gop_thu_tuc_khong_bat_buoc_thanh_phan_201(self):
        schema = copy.deepcopy(CT)
        schema["properties"]["thanh_phan"]["required"] = []
        schema["properties"]["thanh_phan"]["properties"]["ban_chinh"]["minItems"] = 0
        csdl = CsdlGia(schema=schema)
        status, data = self.goi(csdl, "/ho-so", {"thu_tuc_id": TT_ID, "ho_ten_nguoi_nop": "X"})
        self.assertEqual(status, 201)
        self.assertEqual(data["hoSo"]["id"], HS_ID)
        self.assertEqual(len(csdl.flowable_post), 1)

    def test_schema_trong_csdl_hong_500_khong_khoi_tao(self):
        csdl = CsdlGia(schema={"type": 5}, ds_tep=TEP_KS_DU)
        status, data = self.khoi_tao(csdl)
        self.assertEqual(status, 500)
        self.assertEqual(csdl.flowable_post, [])


if __name__ == "__main__":
    unittest.main()
