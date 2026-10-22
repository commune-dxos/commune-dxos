# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Test của scripts/check-bpmn.py (#11): quy trình thật của mọi gói thủ tục đạt, còn mỗi lỗi
vẽ tay hay gặp phải bị bắt. Chạy: make lint (job CI `bpmn`), chỉ thư viện chuẩn."""
import glob
import importlib.util
import os
import tempfile
import unittest

GOC = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
_spec = importlib.util.spec_from_file_location("check_bpmn", os.path.join(GOC, "scripts", "check-bpmn.py"))
check_bpmn = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(check_bpmn)

# Quy trình nhỏ hợp lệ; mỗi test thay một đoạn để tạo đúng một lỗi.
MAU = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xmlns:flowable="http://flowable.org/bpmn" targetNamespace="urn:test" id="def">
  <process id="mau" isExecutable="true">
    <startEvent id="bd"/>
    <sequenceFlow id="f1" sourceRef="bd" targetRef="viec"/>
    <userTask id="viec" flowable:candidateGroups="ho_tich"/>
    <sequenceFlow id="f2" sourceRef="viec" targetRef="gw"/>
    <exclusiveGateway id="gw" default="f_khong"/>
    <sequenceFlow id="f_co" sourceRef="gw" targetRef="kt">
      <conditionExpression xsi:type="tFormalExpression">${ok == true}</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id="f_khong" sourceRef="gw" targetRef="viec"/>
    <endEvent id="kt"/>
  </process>
</definitions>
"""


def kiem_noi_dung(*noi_dung):
    with tempfile.TemporaryDirectory() as td:
        tep = []
        for i, nd in enumerate(noi_dung):
            p = os.path.join(td, f"q{i}.bpmn20.xml")
            with open(p, "w", encoding="utf-8") as f:
                f.write(nd)
            tep.append(p)
        loi, _ = check_bpmn.kiem(tep, td)
        return loi


class TestCheckBpmn(unittest.TestCase):
    def assertLoi(self, loi, doan):
        self.assertTrue(any(doan in d for d in loi), f"không thấy lỗi chứa {doan!r} trong {loi}")

    def test_quy_trinh_cua_cac_goi_thu_tuc_dat(self):
        tep = sorted(glob.glob(os.path.join(GOC, "thu-tuc", "*", "quy-trinh.bpmn20.xml")))
        self.assertGreaterEqual(len(tep), 2, "cần ít nhất 2 gói thu-tuc/*/quy-trinh.bpmn20.xml")
        loi, process_ids = check_bpmn.kiem(tep, GOC)
        self.assertEqual(loi, [])
        self.assertEqual(len(process_ids), len(tep))

    def test_mau_hop_le(self):
        self.assertEqual(kiem_noi_dung(MAU), [])

    def test_xml_hong(self):
        self.assertLoi(kiem_noi_dung(MAU.replace("</process>", "")), "XML không hợp lệ")

    def test_goc_khong_phai_definitions_bpmn(self):
        self.assertLoi(kiem_noi_dung(MAU.replace("20100524/MODEL", "20100524/KHAC")), "phần tử gốc")

    def test_thieu_is_executable(self):
        self.assertLoi(kiem_noi_dung(MAU.replace(' isExecutable="true"', "")), "isExecutable")

    def test_id_trung(self):
        self.assertLoi(kiem_noi_dung(MAU.replace('id="kt"', 'id="viec"')), "bị trùng")

    def test_process_id_trung_giua_cac_tep(self):
        self.assertLoi(kiem_noi_dung(MAU, MAU), "process id 'mau' trùng")

    def test_thieu_end_event(self):
        loi = kiem_noi_dung(MAU.replace('<endEvent id="kt"/>', "").replace('targetRef="kt"', 'targetRef="viec"'))
        self.assertLoi(loi, "thiếu endEvent")

    def test_flow_tro_toi_nut_khong_ton_tai(self):
        self.assertLoi(kiem_noi_dung(MAU.replace('targetRef="kt"', 'targetRef="khong_co"')), "không tồn tại")

    def test_nut_khong_co_duong_ra(self):
        loi = kiem_noi_dung(MAU.replace('<endEvent id="kt"/>', '<endEvent id="kt"/><userTask id="mo_coi" flowable:assignee="a"/>'))
        self.assertLoi(loi, "'mo_coi' không có đường ra")
        self.assertLoi(loi, "'mo_coi' không có đường vào")

    def test_gateway_default_sai(self):
        self.assertLoi(kiem_noi_dung(MAU.replace('default="f_khong"', 'default="f1"')), "default='f1'")

    def test_duong_ra_gateway_thieu_dieu_kien(self):
        self.assertLoi(kiem_noi_dung(MAU.replace(' default="f_khong"', "")), "thiếu điều kiện")

    def test_user_task_khong_nguoi_nhan(self):
        self.assertLoi(kiem_noi_dung(MAU.replace(' flowable:candidateGroups="ho_tich"', "")), "không có người nhận")

    def test_bien_buoc_kieu_la(self):
        loi = kiem_noi_dung(MAU.replace('<userTask id="viec" flowable:candidateGroups="ho_tich"/>',
                                        '<userTask id="viec" flowable:candidateGroups="ho_tich"><extensionElements>'
                                        '<flowable:formProperty id="ok" type="date"/></extensionElements></userTask>'))
        self.assertLoi(loi, "kiểu 'date'")


if __name__ == "__main__":
    unittest.main()
