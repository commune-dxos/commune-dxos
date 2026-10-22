# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Kiểm tra cấu trúc quy trình BPMN viết tay, dùng chung cho bộ nạp gói thủ tục
(nap_thu_tuc.py) và `make check`/CI (scripts/check-bpmn.py). Chỉ thư viện chuẩn Python.

Không có modeler (bpmn-js bị cấm, D-004) nên lỗi vẽ thiếu mũi tên chỉ lộ ra khi Flowable
triển khai. Ở đây bắt sớm:
  - XML hợp lệ, gốc là <definitions> của BPMN 2.0;
  - id không trùng trong tệp, process id không trùng giữa các tệp, process isExecutable;
  - mỗi process (và subProcess) có startEvent và endEvent;
  - sequenceFlow trỏ tới phần tử có thật trong cùng phạm vi;
  - mọi nút có đường vào (trừ startEvent, boundaryEvent) và đường ra (trừ endEvent);
  - exclusiveGateway: `default` là một đường ra của nó, các đường ra khác có điều kiện;
  - userTask có người nhận (assignee, candidateGroups hoặc candidateUsers);
  - flowable:formProperty của userTask (biến người xử lý đặt khi hoàn thành bước) có id và
    kiểu boolean | string | long.
Kiểm tra đầy đủ ngữ nghĩa vẫn do Flowable làm khi deploy (make smoke).
Test: scripts/tests/test_check_bpmn.py (job CI `bpmn`), mot-cua/backend/tests/test_goi_thu_tuc.py.
"""
import os
import xml.etree.ElementTree as ET

BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL"
FLOWABLE = "http://flowable.org/bpmn"
NODE_TAGS = {
    "startEvent", "endEvent", "userTask", "serviceTask", "scriptTask", "sendTask",
    "receiveTask", "manualTask", "businessRuleTask", "callActivity", "subProcess",
    "exclusiveGateway", "parallelGateway", "inclusiveGateway", "eventBasedGateway",
    "intermediateCatchEvent", "intermediateThrowEvent", "boundaryEvent",
}
# Kiểu biến của flowable:formProperty mà API một cửa kiểm được khi hoàn thành bước.
KIEU_BIEN = {"boolean", "string", "long"}


def ten(el):
    return el.tag.split("}", 1)[1] if el.tag.startswith("{") else el.tag


def kiem_pham_vi(scope, tep, loi):
    """Kiểm một process hoặc subProcess (các nút con trực tiếp)."""
    sid = scope.get("id", "?")
    nodes = {c.get("id"): c for c in scope if ten(c) in NODE_TAGS}
    flows = [c for c in scope if ten(c) == "sequenceFlow"]
    vao = {i: [] for i in nodes}
    ra = {i: [] for i in nodes}
    for f in flows:
        src, dst = f.get("sourceRef"), f.get("targetRef")
        for vai, ref in (("sourceRef", src), ("targetRef", dst)):
            if ref not in nodes:
                loi.append(f"{tep}: {sid}: sequenceFlow {f.get('id')} có {vai}='{ref}' không tồn tại trong phạm vi")
        if src in ra:
            ra[src].append(f)
        if dst in vao:
            vao[dst].append(f)
    loai = [ten(n) for n in nodes.values()]
    if "startEvent" not in loai:
        loi.append(f"{tep}: {sid}: thiếu startEvent")
    if "endEvent" not in loai:
        loi.append(f"{tep}: {sid}: thiếu endEvent")
    for nid, n in nodes.items():
        t = ten(n)
        if t not in ("startEvent", "boundaryEvent") and not vao[nid] and not (t == "subProcess" and n.get("triggeredByEvent") == "true"):
            loi.append(f"{tep}: {sid}: {t} '{nid}' không có đường vào")
        if t != "endEvent" and not ra[nid] and not (t == "subProcess" and n.get("triggeredByEvent") == "true"):
            loi.append(f"{tep}: {sid}: {t} '{nid}' không có đường ra")
        if t == "exclusiveGateway" and len(ra[nid]) > 1:
            mac_dinh = n.get("default")
            if mac_dinh and mac_dinh not in {f.get("id") for f in ra[nid]}:
                loi.append(f"{tep}: {sid}: gateway '{nid}' có default='{mac_dinh}' không phải đường ra của nó")
            for f in ra[nid]:
                if f.get("id") != mac_dinh and f.find(f"{{{BPMN}}}conditionExpression") is None:
                    loi.append(f"{tep}: {sid}: đường ra {f.get('id')} của gateway '{nid}' thiếu điều kiện")
        if t == "userTask" and not any(n.get(f"{{{FLOWABLE}}}{a}") for a in ("assignee", "candidateGroups", "candidateUsers")):
            loi.append(f"{tep}: {sid}: userTask '{nid}' không có người nhận (assignee/candidateGroups/candidateUsers)")
        if t == "userTask":
            ten_bien = [fp.get("id") for fp in n.iter(f"{{{FLOWABLE}}}formProperty")]
            for b in sorted({b for b in ten_bien if b and ten_bien.count(b) > 1}):
                loi.append(f"{tep}: {sid}: userTask '{nid}' khai biến '{b}' hai lần")
            for fp in n.iter(f"{{{FLOWABLE}}}formProperty"):
                if not fp.get("id"):
                    loi.append(f"{tep}: {sid}: userTask '{nid}' có formProperty thiếu id")
                elif fp.get("type", "string") not in KIEU_BIEN:
                    loi.append(f"{tep}: {sid}: userTask '{nid}' biến '{fp.get('id')}' có kiểu "
                               f"'{fp.get('type')}' (chỉ nhận {', '.join(sorted(KIEU_BIEN))})")
        if t == "subProcess":
            kiem_pham_vi(n, tep, loi)


def kiem(tep_list, goc):
    """Kiểm các tệp BPMN; trả về (danh sách lỗi, {process id: tệp})."""
    loi = []
    process_ids = {}
    for duong_dan in tep_list:
        tep = os.path.relpath(duong_dan, goc)
        try:
            root = ET.parse(duong_dan).getroot()
        except ET.ParseError as e:
            loi.append(f"{tep}: XML không hợp lệ: {e}")
            continue
        if root.tag != f"{{{BPMN}}}definitions":
            loi.append(f"{tep}: phần tử gốc phải là <definitions> namespace {BPMN}")
            continue
        # id của flowable:formProperty là tên biến, chỉ cần duy nhất trong một userTask.
        ids = [el.get("id") for el in root.iter() if el.get("id") and not el.tag.startswith(f"{{{FLOWABLE}}}")]
        for i in sorted({i for i in ids if ids.count(i) > 1}):
            loi.append(f"{tep}: id '{i}' bị trùng")
        processes = root.findall(f"{{{BPMN}}}process")
        if not processes:
            loi.append(f"{tep}: không có <process>")
        for p in processes:
            pid = p.get("id")
            if pid in process_ids:
                loi.append(f"{tep}: process id '{pid}' trùng với {process_ids[pid]}")
            process_ids[pid] = tep
            if p.get("isExecutable") != "true":
                loi.append(f"{tep}: process '{pid}' thiếu isExecutable=\"true\"")
            kiem_pham_vi(p, tep, loi)
    return loi, process_ids


def buoc_nguoi_xu_ly(process):
    """→ {id userTask: {"ten", "nhom": [candidateGroups], "assignee", "bien": {tên: {"kieu",
    "bat_buoc"}}}} của mọi userTask trong process (kể cả trong subProcess). Biến lấy từ
    flowable:formProperty; API một cửa chỉ nhận đúng các biến này khi hoàn thành bước."""
    ket_qua = {}
    for n in process.iter(f"{{{BPMN}}}userTask"):
        nhom = n.get(f"{{{FLOWABLE}}}candidateGroups") or ""
        bien = {}
        for fp in n.iter(f"{{{FLOWABLE}}}formProperty"):
            if fp.get("id"):
                bien[fp.get("id")] = {"kieu": fp.get("type", "string"),
                                      "bat_buoc": fp.get("required") == "true"}
        ket_qua[n.get("id")] = {"ten": n.get("name") or n.get("id"),
                                "nhom": [g.strip() for g in nhom.split(",") if g.strip()],
                                "assignee": n.get(f"{{{FLOWABLE}}}assignee"), "bien": bien}
    return ket_qua


def doc_process(duong_dan):
    """→ phần tử <process> duy nhất của tệp (đã qua kiem). Không có hoặc nhiều hơn một → None."""
    ps = ET.parse(duong_dan).getroot().findall(f"{{{BPMN}}}process")
    return ps[0] if len(ps) == 1 else None
