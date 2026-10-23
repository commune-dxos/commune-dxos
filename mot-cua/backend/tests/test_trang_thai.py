# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Test trạng thái hồ sơ theo bước Flowable (#73): trang_thai.py (ánh xạ mặc định, ghi đè của gói,
tính trạng thái mới), khóa trang_thai_theo_buoc của thu-tuc.yaml trong bộ kiểm gói, mot-cua-api
gọi RPC đồng bộ sau khi Flowable chạy (main.hoan_thanh) và đối soát của mot-cua-worker. Flowable,
PostgREST, RPC được thay bằng đối tượng giả; gói thật lấy từ thu-tuc/. Không cần Docker.

Chạy: make test-backend
"""

import copy
import datetime
import logging
import os
import shutil
import sys
import tempfile
import unittest
from unittest import mock

os.environ.setdefault("DXOS_JWT_ISSUER", "http://localhost:8080/realms/dxos")
THU_MUC = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(THU_MUC))
THU_TUC = os.path.normpath(os.path.join(THU_MUC, "..", "..", "..", "thu-tuc"))

import goi_thu_tuc  # noqa: E402
import hop_thu  # noqa: E402
import main  # noqa: E402
import trang_thai  # noqa: E402
import worker  # noqa: E402

logging.disable(logging.CRITICAL)

HS_ID = "7e573000-0000-4000-8000-000000000001"
PI = "pi-73"
SUB_CB = "sub-can-bo"
SUB_CD = "sub-cong-dan"
KS01, _ = goi_thu_tuc.kiem_goi(os.path.join(THU_TUC, "khai-sinh"))
CT01, _ = goi_thu_tuc.kiem_goi(os.path.join(THU_TUC, "chung-thuc-ban-sao"))


class AnhXa(unittest.TestCase):
    def test_bang_cua_hai_goi_that(self):
        self.assertEqual(KS01["trang_thai_buoc"], {"tiep_nhan": "moi", "bo_sung": "cho_bo_sung",
                                                   "tham_dinh": "dang_xu_ly", "phe_duyet": "cho_phe_duyet"})
        self.assertEqual(CT01["trang_thai_buoc"], {"tiep_nhan": "moi", "kiem_tra_ban_chinh": "dang_xu_ly",
                                                   "ky_chung_thuc": "cho_phe_duyet", "tra_ket_qua": "dang_xu_ly"})

    def test_mac_dinh_theo_nguoi_nhan(self):
        self.assertEqual(trang_thai.mac_dinh({"assignee": "${nguoiNopSub}", "nhom": []}), "cho_bo_sung")
        self.assertEqual(trang_thai.mac_dinh({"assignee": None, "nhom": ["lanh_dao"]}), "cho_phe_duyet")
        self.assertEqual(trang_thai.mac_dinh({"assignee": None, "nhom": ["ho_tich"]}), "dang_xu_ly")

    def test_ghi_de_hop_le_va_loi(self):
        buoc = {"a": {}, "b": {}}
        self.assertEqual(trang_thai.doc_ghi_de(["a: moi", "b:cho_phe_duyet"], buoc), ({"a": "moi", "b": "cho_phe_duyet"}, []))
        for muc, doan in (("a moi", "phải có dạng"), ("x: moi", "không phải userTask"),
                          ("a: hoan_tat", "endEvent đặt ketQua"), ("a: la", "chỉ nhận")):
            _, loi = trang_thai.doc_ghi_de([muc], buoc)
            self.assertTrue(loi and doan in loi[0], (muc, loi))
        _, loi = trang_thai.doc_ghi_de(["a: moi", "a: dang_xu_ly"], buoc)
        self.assertIn("khai hai lần", loi[0])


class Tinh(unittest.TestCase):
    B = KS01["trang_thai_buoc"]

    def test_luong_ks01(self):
        t = trang_thai.tinh
        self.assertIsNone(t("moi", ["tiep_nhan"], self.B))                    # vừa khởi tạo: vẫn mới
        self.assertEqual(t("moi", ["tham_dinh"], self.B), "dang_xu_ly")
        self.assertEqual(t("moi", ["bo_sung"], self.B), "cho_bo_sung")
        self.assertEqual(t("cho_bo_sung", ["tiep_nhan"], self.B), "dang_xu_ly")  # nộp lại: không về moi
        self.assertEqual(t("dang_xu_ly", ["phe_duyet"], self.B), "cho_phe_duyet")
        self.assertEqual(t("cho_phe_duyet", ["tham_dinh"], self.B), "dang_xu_ly")  # lãnh đạo trả lại
        self.assertEqual(t("cho_phe_duyet", [], self.B, "hoan_tat", True), "hoan_tat")
        self.assertEqual(t("dang_xu_ly", [], self.B, "tu_choi", True), "tu_choi")

    def test_khong_doi(self):
        t = trang_thai.tinh
        self.assertIsNone(t("dang_xu_ly", ["tham_dinh"], self.B))            # đã đúng
        self.assertIsNone(t("hoan_tat", ["tham_dinh"], self.B))              # đã đóng
        self.assertIsNone(t("dang_xu_ly", [], self.B))                       # đang ở hẹn giờ/service task
        self.assertIsNone(t("dang_xu_ly", [], self.B, None, True))           # kết thúc không có ketQua

    def test_buoc_la_va_song_song(self):
        self.assertEqual(trang_thai.tinh("moi", ["buoc_la"], None), "dang_xu_ly")
        self.assertEqual(trang_thai.tinh("moi", ["phe_duyet", "bo_sung"], self.B), "cho_bo_sung")
        self.assertEqual(trang_thai.tinh("moi", ["phe_duyet", "tham_dinh"], self.B), "dang_xu_ly")

    def test_ly_do(self):
        self.assertEqual(trang_thai.ly_do("cho_bo_sung", "  Thiếu tờ khai ", "x"), "Thiếu tờ khai")
        self.assertIn("Tiếp nhận", trang_thai.ly_do("cho_bo_sung", "", "Tiếp nhận"))
        self.assertTrue(trang_thai.ly_do("tu_choi", None, None))
        self.assertIsNone(trang_thai.ly_do("dang_xu_ly", "ghi chú", "x"))


class GoiKhaiTrangThai(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.td)
        self.goi = os.path.join(self.td, "khai-sinh")
        shutil.copytree(os.path.join(THU_TUC, "khai-sinh"), self.goi)

    def sua_yaml(self, cu, moi):
        p = os.path.join(self.goi, "thu-tuc.yaml")
        with open(p, encoding="utf-8") as f:
            s = f.read()
        self.assertIn(cu, s)
        with open(p, "w", encoding="utf-8") as f:
            f.write(s.replace(cu, moi))

    def test_khong_khai_thi_dung_mac_dinh(self):
        self.sua_yaml("trang_thai_theo_buoc:\n  - tiep_nhan: moi\n", "")
        kq, loi = goi_thu_tuc.kiem_goi(self.goi)
        self.assertEqual(loi, [])
        self.assertEqual(kq["trang_thai_buoc"]["tiep_nhan"], "dang_xu_ly")

    def test_buoc_khong_co_trong_bpmn(self):
        self.sua_yaml("  - tiep_nhan: moi", "  - tiep_nhan: moi\n  - ky_so: cho_phe_duyet")
        kq, loi = goi_thu_tuc.kiem_goi(self.goi)
        self.assertIsNone(kq)
        self.assertTrue(any("thu-tuc.yaml: trang_thai_theo_buoc: bước 'ky_so'" in l for l in loi), loi)

    def test_trang_thai_ket_thuc_khong_khai_o_buoc(self):
        self.sua_yaml("  - tiep_nhan: moi", "  - phe_duyet: hoan_tat")
        self.assertIsNone(goi_thu_tuc.kiem_goi(self.goi)[0])

    def test_nap_gui_anh_xa_cho_rpc(self):
        # nap_thu_tuc gửi mọi khóa của gói (trừ BPMN) cho RPC mot_cua.nap_thu_tuc.
        kq, _ = goi_thu_tuc.kiem_goi(self.goi)
        self.assertIn("trang_thai_buoc", {k for k in kq if k not in ("bpmn", "bpmn_sha256")})


class FlowableGia:
    """Flowable REST giả cho main.hoan_thanh: một task đang mở; hoàn thành thì sang `buoc_sau`
    (rỗng = quy trình kết thúc với ket_qua)."""

    def __init__(self, buoc, nhom="ho_tich", assignee=None, buoc_sau=(), ket_qua=None, loi_complete=False):
        self.task = {"id": "7e573000-0000-4000-8000-0000000000aa", "taskDefinitionKey": buoc, "name": f"Bước {buoc}",
                     "assignee": assignee, "processInstanceId": PI, "processDefinitionId": "dang_ky_khai_sinh:1:x"}
        self.nhom, self.buoc_sau, self.ket_qua, self.loi_complete = nhom, list(buoc_sau), ket_qua, loi_complete
        self.da_xong, self.goi = False, []

    def __call__(self, method, path, body=None, cho_phep=()):
        self.goi.append((method, path, body))
        tid = self.task["id"]
        if path == f"/runtime/tasks/{tid}" and method == "GET":
            return 200, copy.deepcopy(self.task)
        if path == f"/runtime/tasks/{tid}/identitylinks":
            return 200, [{"type": "candidate", "group": self.nhom}]
        if path == f"/runtime/process-instances/{PI}/variables/hoSoId":
            return 200, {"value": HS_ID}
        if path == f"/runtime/tasks/{tid}" and method == "POST":
            if body["action"] == "complete":
                if self.loi_complete:
                    raise main.Loi(502, "Workflow engine trả lỗi", {"flowable": 500})
                self.da_xong = True
            return 200, None
        if path == f"/runtime/tasks?processInstanceId={PI}":
            buoc = self.buoc_sau if self.da_xong else [self.task["taskDefinitionKey"]]
            return 200, {"data": [{"id": f"t-{b}", "taskDefinitionKey": b, "name": b} for b in buoc]}
        if path == f"/history/historic-process-instances/{PI}":
            return 200, ({"id": PI, "endTime": "2026-10-23T10:00:00Z", "endActivityId": f"ket_thuc_{self.ket_qua}"}
                         if self.da_xong and not self.buoc_sau else {"id": PI})
        if path.startswith(f"/history/historic-variable-instances?processInstanceId={PI}&variableName=ketQua"):
            return 200, {"data": [{"variable": {"value": self.ket_qua}}]}
        raise AssertionError(f"Flowable giả không biết {method} {path}")


class HoanThanhBuoc(unittest.TestCase):
    """main.hoan_thanh: Flowable trước, rồi MỘT lời gọi RPC dong_bo_trang_thai (hop_thu.dong_bo)."""

    def chay(self, fl, bien, vai="can_bo", sub=SUB_CB, hien_tai="moi", loi_dong_bo=None, du_tep=True):
        self.rpc = []

        def pgrst(token, method, path, body=None, prefer=None):
            if path.startswith("/can_bo?"):
                return [{"linh_vuc": [{"ma": "ho_tich"}]}]
            if path.startswith("/thu_tuc?select=bien_theo_buoc,trang_thai_buoc"):
                return [{"bien_theo_buoc": KS01["bien_theo_buoc"], "trang_thai_buoc": KS01["trang_thai_buoc"]}]
            raise AssertionError(f"PostgREST giả không biết {method} {path}")

        def dong_bo(ho_so_id, moi, ds, **kw):
            if loi_dong_bo:
                raise loi_dong_bo
            self.rpc.append({"ho_so_id": ho_so_id, "trang_thai": moi, "su_kien": [(ev["loai"], ev["duLieu"], k) for ev, k in ds], **kw})
            return {"trangThaiTruoc": hien_tai, "trangThai": moi or hien_tai, "daDoi": bool(moi)}

        ngu_canh = {HS_ID: {"id": HS_ID, "ma_ho_so": "HS20261023-000073", "trang_thai": hien_tai,
                            "thu_tuc": {"ma": "KS01", "linh_vuc": {"ma": "ho_tich"}}}}
        claims = {"sub": sub, "resource_access": {"dxos_api": {"roles": [vai]}}}
        kiem = mock.Mock(side_effect=None if du_tep else main.Loi(422, "Hồ sơ chưa đủ thành phần"))
        with mock.patch.object(main, "flowable", fl), mock.patch.object(main, "pgrst", pgrst), \
                mock.patch.object(main.hop_thu, "ngu_canh", lambda ids: ngu_canh), \
                mock.patch.object(main.hop_thu, "dong_bo", dong_bo), \
                mock.patch.object(main, "_doc_ho_so", lambda tk, i: {"id": i}), \
                mock.patch.object(main, "_kiem_ho_so", kiem):
            self.kiem_tep = kiem
            return main.hoan_thanh("tk", claims, fl.task["id"], {"bien": bien})

    def test_tiep_nhan_thieu_thanh_phan_cho_bo_sung_ly_do_ghi_chu(self):
        fl = FlowableGia("tiep_nhan", buoc_sau=["bo_sung"])
        status, data = self.chay(fl, {"hopLe": False, "ghiChu": "Thiếu tờ khai"})
        self.assertEqual((status, data["trangThai"]), (200, "cho_bo_sung"))
        r = self.rpc[0]
        self.assertEqual((r["trang_thai"], r["ly_do"], r["buoc"], r["nguoi_sub"]),
                         ("cho_bo_sung", "Thiếu tờ khai", "tiep_nhan", SUB_CB))
        self.assertEqual([(l, k) for l, _, k in r["su_kien"]], [("ho_so.chuyen_buoc", f"ho_so.chuyen_buoc:{fl.task['id']}")])

    def test_tiep_nhan_du_dang_xu_ly(self):
        status, data = self.chay(FlowableGia("tiep_nhan", buoc_sau=["tham_dinh"]), {"hopLe": True})
        self.assertEqual(data["trangThai"], "dang_xu_ly")
        self.assertIsNone(self.rpc[0]["ly_do"])

    def test_tham_dinh_dat_cho_phe_duyet(self):
        _, data = self.chay(FlowableGia("tham_dinh", buoc_sau=["phe_duyet"]), {"datYeuCau": True}, hien_tai="dang_xu_ly")
        self.assertEqual(data["trangThai"], "cho_phe_duyet")

    def test_phe_duyet_ket_thuc_hoan_tat_mot_rpc_hai_su_kien(self):
        fl = FlowableGia("phe_duyet", nhom="lanh_dao", ket_qua="hoan_tat")
        with mock.patch.object(main, "nhom_ung_vien", return_value={"lanh_dao"}):
            status, data = self.chay(fl, {"pheDuyet": True}, vai="lanh_dao", hien_tai="cho_phe_duyet")
        self.assertEqual((status, data["trangThai"], len(self.rpc)), (200, "hoan_tat", 1))
        self.assertEqual([(l, k) for l, _, k in self.rpc[0]["su_kien"]],
                         [("ho_so.chuyen_buoc", f"ho_so.chuyen_buoc:{fl.task['id']}"), ("ho_so.hoan_tat", f"ho_so.ket_thuc:{PI}")])
        self.assertEqual(self.rpc[0]["su_kien"][1][1]["diemKetThuc"], "ket_thuc_hoan_tat")

    def test_tham_dinh_khong_dat_tu_choi(self):
        fl = FlowableGia("tham_dinh", ket_qua="tu_choi")
        _, data = self.chay(fl, {"datYeuCau": False, "ghiChu": "Giấy chứng sinh không hợp lệ"}, hien_tai="dang_xu_ly")
        self.assertEqual((data["trangThai"], self.rpc[0]["ly_do"]), ("tu_choi", "Giấy chứng sinh không hợp lệ"))

    def test_cong_dan_nop_lai_kiem_thanh_phan_roi_dang_xu_ly(self):
        fl = FlowableGia("bo_sung", nhom=None, assignee=SUB_CD, buoc_sau=["tiep_nhan"])
        _, data = self.chay(fl, {"ghiChu": "đã bổ sung"}, vai="cong_dan", sub=SUB_CD, hien_tai="cho_bo_sung")
        self.assertEqual(data["trangThai"], "dang_xu_ly")
        self.kiem_tep.assert_called_once()

    def test_cong_dan_nop_lai_thieu_tep_422_khong_goi_flowable(self):
        fl = FlowableGia("bo_sung", nhom=None, assignee=SUB_CD, buoc_sau=["tiep_nhan"])
        with self.assertRaises(main.Loi) as e:
            self.chay(fl, {}, vai="cong_dan", sub=SUB_CD, hien_tai="cho_bo_sung", du_tep=False)
        self.assertEqual(e.exception.status, 422)
        self.assertFalse(any(m == "POST" for m, _, _ in fl.goi))
        self.assertEqual(self.rpc, [])

    def test_flowable_loi_khong_ghi_csdl(self):
        fl = FlowableGia("tiep_nhan", buoc_sau=["tham_dinh"], loi_complete=True)
        with self.assertRaises(main.Loi) as e:
            self.chay(fl, {"hopLe": True})
        self.assertEqual(e.exception.status, 502)
        self.assertEqual(self.rpc, [])

    def test_csdl_loi_sau_flowable_van_200_trang_thai_none(self):
        # Task đã hoàn thành trong Flowable: không báo lỗi cho người dùng; worker đối soát lại.
        status, data = self.chay(FlowableGia("tiep_nhan", buoc_sau=["tham_dinh"]), {"hopLe": True},
                                 loi_dong_bo=hop_thu.LoiHopThu("PostgREST dừng"))
        self.assertEqual((status, data["buocDangMo"][0]["buoc"], data["trangThai"]), (200, "tham_dinh", None))


class DoiSoat(unittest.TestCase):
    """worker.doi_soat_ho_so: sửa trạng thái lệch với Flowable qua RPC, nguồn doi_soat."""
    LUC = datetime.datetime(2026, 10, 23, 15, 0, tzinfo=worker.su_kien.VN)
    BANG = {"dang_ky_khai_sinh": KS01["trang_thai_buoc"]}

    def chay(self, trang_thai_hs, qt=None, tasks=(), ket_qua=None, ghi_chu=None, cho_giay=60, tao_luc="2026-10-23T07:00:00Z"):
        self.rpc = []

        def flowable(path):
            if path.startswith("/history/historic-process-instances?"):
                return {"data": [qt] if qt else []}
            if path.startswith("/runtime/tasks?processInstanceId="):
                return {"data": [{"taskDefinitionKey": b, "createTime": tao_luc} for b in tasks]}
            if "variableName=ketQua" in path:
                return {"data": [{"variable": {"value": ket_qua}}]}
            if "variableName=ghiChu" in path:
                return {"data": [{"variable": {"value": ghi_chu}}] if ghi_chu else []}
            raise AssertionError(path)

        def dong_bo(ho_so_id, moi, ds, **kw):
            self.rpc.append({"trang_thai": moi, "su_kien": [(ev["loai"], k) for ev, k in ds], **kw})
            return {"trangThaiTruoc": trang_thai_hs, "trangThai": moi, "daDoi": True}

        hs = {"id": HS_ID, "ma_ho_so": "HS20261023-000073", "trang_thai": trang_thai_hs,
              "thu_tuc": {"ma": "KS01", "linh_vuc": {"ma": "ho_tich"}}}
        with mock.patch.object(worker, "flowable", flowable), mock.patch.object(worker.hop_thu, "dong_bo", dong_bo):
            return worker.doi_soat_ho_so(hs, self.BANG, self.LUC, cho_giay)

    QT = {"id": PI, "processDefinitionId": "dang_ky_khai_sinh:1:x", "startTime": "2026-10-23T01:00:00Z"}

    def test_lech_dang_chay_sua_theo_buoc_mo(self):
        self.assertEqual(self.chay("dang_xu_ly", self.QT, ["phe_duyet"]), "cho_phe_duyet")
        self.assertEqual((self.rpc[0]["nguon"], self.rpc[0]["su_kien"]), ("doi_soat", [("ho_so.chuyen_buoc", None)]))

    def test_khop_thi_khong_goi_rpc(self):
        self.assertIsNone(self.chay("cho_phe_duyet", self.QT, ["phe_duyet"]))
        self.assertEqual(self.rpc, [])

    def test_ho_so_giay_khong_co_quy_trinh_khong_dung_toi(self):
        self.assertIsNone(self.chay("dang_xu_ly"))
        self.assertEqual(self.rpc, [])

    def test_vua_doi_buoc_bo_qua_cho_api(self):
        self.assertIsNone(self.chay("dang_xu_ly", self.QT, ["phe_duyet"], tao_luc="2026-10-23T07:59:50Z"))
        self.assertEqual(self.chay("dang_xu_ly", self.QT, ["phe_duyet"], cho_giay=0, tao_luc="2026-10-23T07:59:50Z"),
                         "cho_phe_duyet")

    def test_ket_thuc_tu_choi_ly_do_tu_ghi_chu_khoa_ket_thuc(self):
        qt = {**self.QT, "endTime": "2026-10-23T05:00:00Z", "endActivityId": "ket_thuc_tu_choi"}
        self.assertEqual(self.chay("dang_xu_ly", qt, ket_qua="tu_choi", ghi_chu="Không đạt"), "tu_choi")
        self.assertEqual((self.rpc[0]["ly_do"], self.rpc[0]["su_kien"]), ("Không đạt", [("ho_so.tu_choi", f"ho_so.ket_thuc:{PI}")]))


if __name__ == "__main__":
    unittest.main()
