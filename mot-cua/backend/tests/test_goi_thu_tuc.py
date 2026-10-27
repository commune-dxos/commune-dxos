# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Test bộ nạp gói thủ tục (D-009): goi_thu_tuc.py (kiểm gói) và nap_thu_tuc.py (nạp, bỏ qua
gói lỗi). Không cần Docker: Flowable/PostgREST được thay bằng đối tượng giả. Chạy: make test-backend.

Mỗi test chép một gói thật (thu-tuc/chung-thuc-ban-sao) ra thư mục tạm rồi làm hỏng đúng
một chỗ, để chắc bộ nạp bắt lỗi đó và chỉ lỗi đó."""

import io
import json
import logging
import os
import shutil
import sys
import tempfile
import unittest

THU_MUC = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(THU_MUC))
GOC = os.path.normpath(os.path.join(THU_MUC, "..", "..", ".."))
THU_TUC = os.path.join(GOC, "thu-tuc")

import goi_thu_tuc  # noqa: E402
import nap_thu_tuc  # noqa: E402


class CoGoiTam(unittest.TestCase):
    """Thư mục tạm chứa bản chép của gói thật."""

    def setUp(self):
        self.td = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.td)

    def chep(self, goc="chung-thuc-ban-sao", ten=None):
        dich = os.path.join(self.td, ten or goc)
        shutil.copytree(os.path.join(THU_TUC, goc), dich)
        return dich

    def sua(self, goi, tep, cu, moi):
        p = os.path.join(goi, tep)
        with open(p, encoding="utf-8") as f:
            s = f.read()
        self.assertIn(cu, s, f"mẫu thử không còn khớp {tep}")
        with open(p, "w", encoding="utf-8") as f:
            f.write(s.replace(cu, moi))

    def sua_json(self, goi, tep, ham):
        p = os.path.join(goi, tep)
        with open(p, encoding="utf-8") as f:
            d = json.load(f)
        ham(d)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False)

    def assertLoi(self, goi, doan):
        kq, loi = goi_thu_tuc.kiem_goi(goi)
        self.assertIsNone(kq)
        self.assertTrue(any(doan in d for d in loi), f"không thấy lỗi chứa {doan!r} trong {loi}")


class GoiHopLe(CoGoiTam):
    def test_moi_goi_that_deu_hop_le(self):
        cac_goi = goi_thu_tuc.quet(THU_TUC)
        self.assertGreaterEqual(len(cac_goi), 2)
        for ten, duong in cac_goi:
            with self.subTest(goi=ten):
                kq, loi = goi_thu_tuc.kiem_goi(duong)
                self.assertEqual(loi, [])
                self.assertEqual(kq["goi"], ten)

    def test_du_lieu_danh_muc_cua_chung_thuc(self):
        kq, _ = goi_thu_tuc.kiem_goi(os.path.join(THU_TUC, "chung-thuc-ban-sao"))
        self.assertEqual((kq["ma"], kq["linh_vuc"], kq["so_ngay_xu_ly"], kq["le_phi"], kq["quy_trinh"]),
                         ("CT01", "chung_thuc", 0, 2000, "chung_thuc_ban_sao"))
        self.assertEqual(list(kq["bien_theo_buoc"]), ["tiep_nhan", "kiem_tra_ban_chinh", "ky_chung_thuc", "tra_ket_qua"])
        self.assertEqual(kq["bien_theo_buoc"]["tra_ket_qua"]["soBan"], {"kieu": "long", "bat_buoc": True,
                                                                     "ten": "Số bản đã chứng thực"})
        self.assertEqual([(t["ma"], t["bat_buoc"]) for t in kq["thanh_phan"]], [("ban_chinh", True), ("ban_sao", False)])
        self.assertIn("Nghị định 23/2015/NĐ-CP", kq["can_cu_phap_ly"])
        self.assertEqual(len(kq["goi_sha256"]), 64)

    def test_khai_sinh_giu_dung_quy_trinh_va_bien_cu(self):
        # Trước D-009 các biến này nằm cứng trong main.py; nay phải lấy được từ BPMN của gói.
        kq, _ = goi_thu_tuc.kiem_goi(os.path.join(THU_TUC, "khai-sinh"))
        self.assertEqual((kq["ma"], kq["quy_trinh"]), ("KS01", "dang_ky_khai_sinh"))
        self.assertEqual({b: sorted(v) for b, v in kq["bien_theo_buoc"].items()}, {
            "tiep_nhan": ["ghiChu", "hopLe"], "bo_sung": ["ghiChu"],
            "tham_dinh": ["datYeuCau", "ghiChu"], "phe_duyet": ["ghiChu", "pheDuyet"]})

    def test_doi_readme_khong_doi_sha(self):
        goi = self.chep()
        truoc = goi_thu_tuc.sha256_goi(goi)
        with open(os.path.join(goi, "README.md"), "a", encoding="utf-8") as f:
            f.write("\nthêm một dòng\n")
        self.assertEqual(goi_thu_tuc.sha256_goi(goi), truoc)
        self.sua(goi, "thu-tuc.yaml", "le_phi: 2000", "le_phi: 3000")
        self.assertNotEqual(goi_thu_tuc.sha256_goi(goi), truoc)


class GoiThieuTep(CoGoiTam):
    def test_thieu_tung_tep(self):
        for tep in goi_thu_tuc.TEP_BAT_BUOC:
            with self.subTest(tep=tep):
                goi = self.chep(ten=f"thieu-{tep.split('.')[0].lower()}")
                os.remove(os.path.join(goi, tep))
                self.assertLoi(goi, f"thiếu tệp: {tep}")

    def test_ten_thu_muc_sai(self):
        self.assertLoi(self.chep(ten="Chung_Thuc"), "tên thư mục")


class YamlSai(CoGoiTam):
    def test_tap_con_yaml(self):
        self.assertEqual(goi_thu_tuc.doc_yaml("# c\nma: CT01\nso: 3\nco: true\nds:\n  - a\n  - 'b: c'\nx: \"y\" # z\n"),
                         {"ma": "CT01", "so": 3, "co": True, "ds": ["a", "b: c"], "x": "y"})

    def test_mapping_long_nhau_bi_tu_choi(self):
        goi = self.chep()
        self.sua(goi, "thu-tuc.yaml", "le_phi: 2000", "le_phi:\n  muc: 2000")
        self.assertLoi(goi, "dòng")

    def test_khoa_trung(self):
        goi = self.chep()
        self.sua(goi, "thu-tuc.yaml", "le_phi: 2000", "le_phi: 2000\nle_phi: 1")
        self.assertLoi(goi, "bị trùng")

    def test_thieu_khoa_bat_buoc(self):
        goi = self.chep()
        self.sua(goi, "thu-tuc.yaml", "quy_trinh: chung_thuc_ban_sao\n", "")
        self.assertLoi(goi, "thiếu 'quy_trinh'")

    def test_khoa_la(self):
        goi = self.chep()
        self.sua(goi, "thu-tuc.yaml", "le_phi: 2000", "le_phi: 2000\nlephi: 1")
        self.assertLoi(goi, "khóa lạ 'lephi'")

    def test_sai_kieu_thoi_han(self):
        goi = self.chep()
        self.sua(goi, "thu-tuc.yaml", "thoi_han_ngay_lam_viec: 0", "thoi_han_ngay_lam_viec: trong ngày")
        self.assertLoi(goi, "'thoi_han_ngay_lam_viec' phải là int")

    def test_thoi_han_am(self):
        goi = self.chep()
        self.sua(goi, "thu-tuc.yaml", "thoi_han_ngay_lam_viec: 0", "thoi_han_ngay_lam_viec: -1")
        self.assertLoi(goi, "từ 0 (trong ngày) tới 365")

    def test_ma_chu_thuong(self):
        goi = self.chep()
        self.sua(goi, "thu-tuc.yaml", "ma: CT01", "ma: ct01")
        self.assertLoi(goi, "chữ HOA")


class SchemaSai(CoGoiTam):
    T = "thanh-phan-ho-so.schema.json"

    def test_json_hong(self):
        goi = self.chep()
        self.sua(goi, self.T, '"minItems": 1', '"minItems": 1,,')
        self.assertLoi(goi, "JSON không hợp lệ")

    def test_sai_phien_ban_json_schema(self):
        goi = self.chep()
        self.sua_json(goi, self.T, lambda d: d.update({"$schema": "http://json-schema.org/draft-07/schema#"}))
        self.assertLoi(goi, "2020-12")

    def test_bat_buoc_khong_co_trong_properties(self):
        goi = self.chep()
        self.sua_json(goi, self.T, lambda d: d["properties"]["thanh_phan"]["required"].append("giay_khac"))
        self.assertLoi(goi, "thành phần bắt buộc 'giay_khac' không có trong properties")

    def test_thanh_phan_khong_phai_mang(self):
        goi = self.chep()
        self.sua_json(goi, self.T, lambda d: d["properties"]["thanh_phan"]["properties"]["ban_chinh"].update({"type": "string"}))
        self.assertLoi(goi, "\"type\": \"array\"")

    def test_bat_buoc_ma_min_items_0(self):
        goi = self.chep()
        self.sua_json(goi, self.T, lambda d: d["properties"]["thanh_phan"]["properties"]["ban_chinh"].update({"minItems": 0}))
        self.assertLoi(goi, "minItems\" phải ≥ 1")

    def test_cho_phep_thanh_phan_tu_do(self):
        goi = self.chep()
        self.sua_json(goi, self.T, lambda d: d["properties"]["thanh_phan"].update({"additionalProperties": True}))
        self.assertLoi(goi, "additionalProperties")


class DuLieuMauSai(CoGoiTam):
    T = "du-lieu-mau.json"

    def test_thieu_thanh_phan_bat_buoc(self):
        goi = self.chep()
        self.sua_json(goi, self.T, lambda d: d["thanh_phan"].pop("ban_chinh"))
        self.assertLoi(goi, "thiếu thành phần bắt buộc 'ban_chinh'")

    def test_so_giong_cccd(self):
        goi = self.chep()
        self.sua_json(goi, self.T, lambda d: d["ho_so"].update({"ghi_chu": "CCCD 001203004567"}))
        self.assertLoi(goi, "giống số CMND/CCCD")

    def test_bien_xu_ly_khong_khai_trong_bpmn(self):
        goi = self.chep()
        self.sua_json(goi, self.T, lambda d: d["xu_ly"]["tiep_nhan"].update({"duyetNhanh": True}))
        self.assertLoi(goi, "biến 'duyetNhanh' không khai formProperty")

    def test_bien_xu_ly_sai_kieu(self):
        goi = self.chep()
        self.sua_json(goi, self.T, lambda d: d["xu_ly"]["tra_ket_qua"].update({"soBan": True}))
        self.assertLoi(goi, "xu_ly.tra_ket_qua.soBan phải là long")


class BpmnSai(CoGoiTam):
    T = "quy-trinh.bpmn20.xml"

    def test_process_id_qua_dai(self):
        goi = self.chep()
        dai = "hoa_giai_tranh_chap_dat_dai"
        self.sua(goi, "thu-tuc.yaml", "quy_trinh: chung_thuc_ban_sao", f"quy_trinh: {dai}")
        self.sua(goi, self.T, 'process id="chung_thuc_ban_sao"', f'process id="{dai}"')
        self.assertLoi(goi, "dài quá 24 ký tự")

    def test_process_id_khac_yaml(self):
        goi = self.chep()
        self.sua(goi, self.T, 'process id="chung_thuc_ban_sao"', 'process id="chung_thuc_khac"')
        self.assertLoi(goi, "khác quy_trinh")

    def test_xml_hong(self):
        goi = self.chep()
        self.sua(goi, self.T, "</process>", "")
        self.assertLoi(goi, "XML không hợp lệ")

    def test_nhom_khong_thuoc_linh_vuc(self):
        goi = self.chep()
        self.sua(goi, self.T, 'id="tiep_nhan" name="Tiếp nhận yêu cầu chứng thực" flowable:candidateGroups="chung_thuc"',
                 'id="tiep_nhan" name="Tiếp nhận yêu cầu chứng thực" flowable:candidateGroups="ho_tich"')
        self.assertLoi(goi, "giao cho nhóm ho_tich")

    def test_kieu_bien_la(self):
        goi = self.chep()
        self.sua(goi, self.T, 'id="soBan" name="Số bản đã chứng thực" type="long"', 'id="soBan" name="Số bản" type="date"')
        self.assertLoi(goi, "kiểu 'date'")

    def test_thieu_duong_ra(self):
        goi = self.chep()
        self.sua(goi, self.T, '<sequenceFlow id="f_tra" sourceRef="tra_ket_qua" targetRef="ket_thuc_hoan_tat"/>', "")
        self.assertLoi(goi, "'tra_ket_qua' không có đường ra")


class KetNoiGia:
    """Thay Flowable + PostgREST: ghi lại lời gọi; gói có mã trong `tu_choi` bị CSDL từ chối."""

    def __init__(self, tu_choi=()):
        self.deploy, self.nap, self.rut, self.tu_choi = [], [], None, set(tu_choi)


class NapBoQuaGoiLoi(CoGoiTam):
    def setUp(self):
        super().setUp()
        self.kn = KetNoiGia()
        cu = (nap_thu_tuc.KetNoi, nap_thu_tuc.cho_san_sang, nap_thu_tuc.deploy)
        self.addCleanup(lambda: setattr(nap_thu_tuc, "KetNoi", cu[0]) or setattr(nap_thu_tuc, "cho_san_sang", cu[1])
                        or setattr(nap_thu_tuc, "deploy", cu[2]))
        kn = self.kn

        def rpc(_, ham, tham_so):
            if ham == "rut_goi_vang":
                kn.rut = tham_so["p_con_lai"]
                return []
            if tham_so["p_goi"]["ma"] in kn.tu_choi:
                raise nap_thu_tuc.LoiGoi("CSDL từ chối (duplicate key)")
            kn.nap.append(tham_so["p_goi"])
            return {"moi": True, "soThanhPhan": len(tham_so["p_goi"]["thanh_phan"])}

        nap_thu_tuc.KetNoi = lambda: type("K", (), {"rpc": rpc})()
        nap_thu_tuc.cho_san_sang = lambda: None
        nap_thu_tuc.deploy = lambda _, goi: kn.deploy.append(goi["goi"]) or "moi"
        # test_su_kien tắt logging toàn cục; ở đây cần đọc log của bộ nạp, không in ra màn hình.
        self.log = io.StringIO()
        h = logging.StreamHandler(self.log)
        tat, lan = logging.root.manager.disable, nap_thu_tuc.log.propagate
        logging.disable(logging.NOTSET)
        nap_thu_tuc.log.addHandler(h)
        nap_thu_tuc.log.setLevel(logging.INFO)
        nap_thu_tuc.log.propagate = False
        self.addCleanup(logging.disable, tat)
        self.addCleanup(setattr, nap_thu_tuc.log, "propagate", lan)
        self.addCleanup(nap_thu_tuc.log.removeHandler, h)

    def test_goi_loi_bi_bo_qua_goi_tot_van_nap(self):
        self.chep("khai-sinh")
        self.chep("chung-thuc-ban-sao")
        os.remove(os.path.join(self.chep(ten="goi-thieu-tep"), "thu-tuc.yaml"))
        hong = self.chep(ten="goi-schema-sai")
        self.sua(hong, "thanh-phan-ho-so.schema.json", '"type": "object"', '"type": "string"')
        self.assertEqual(nap_thu_tuc.nap(self.td), 0)
        self.assertEqual(self.kn.deploy, ["chung-thuc-ban-sao", "khai-sinh"])
        self.assertEqual([g["ma"] for g in self.kn.nap], ["CT01", "KS01"])
        self.assertNotIn("bpmn", self.kn.nap[0])
        # Gói lỗi vẫn còn thư mục → không bị rút (giữ bản nạp tốt trước đó).
        self.assertEqual(self.kn.rut, ["chung-thuc-ban-sao", "goi-schema-sai", "goi-thieu-tep", "khai-sinh"])
        out = self.log.getvalue()
        self.assertIn("gói goi-thieu-tep LỖI, bỏ qua", out)
        self.assertIn("gói goi-schema-sai LỖI, bỏ qua", out)
        self.assertIn("2 gói đã nạp (chung-thuc-ban-sao, khai-sinh), 2 gói lỗi", out)

    def test_csdl_tu_choi_mot_goi(self):
        self.chep("khai-sinh")
        self.chep("chung-thuc-ban-sao")
        self.kn.tu_choi.add("KS01")
        self.assertEqual(nap_thu_tuc.nap(self.td), 0)
        self.assertEqual([g["ma"] for g in self.kn.nap], ["CT01"])
        self.assertIn("gói khai-sinh LỖI, bỏ qua: CSDL từ chối", self.log.getvalue())

    def test_ha_tang_loi_thi_ma_1(self):
        self.chep()

        def hong():
            raise nap_thu_tuc.LoiHaTang("không gọi được http://flowable:8080")
        nap_thu_tuc.cho_san_sang = hong
        self.assertEqual(nap_thu_tuc.nap(self.td), 1)
        self.assertEqual(self.kn.nap, [])

    def test_chi_kiem_khong_goi_mang_va_bao_loi(self):
        self.chep()
        os.remove(os.path.join(self.chep(ten="goi-hong"), "quy-trinh.bpmn20.xml"))
        nap_thu_tuc.KetNoi = None  # gọi tới là lỗi
        self.assertEqual(nap_thu_tuc.nap(self.td, chi_kiem=True), 1)
        self.assertEqual(self.kn.deploy, [])


if __name__ == "__main__":
    unittest.main()
