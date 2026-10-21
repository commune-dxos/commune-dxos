#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Kiểm tra cú pháp và cấu trúc các quy trình BPMN viết tay (apps/*/processes/*.bpmn20.xml).

Không có modeler (bpmn-js bị cấm, D-004) nên lỗi vẽ thiếu mũi tên chỉ lộ ra khi Flowable
triển khai. Script này bắt sớm trong `make check`/CI, chỉ dùng thư viện chuẩn Python:
  - XML hợp lệ, gốc là <definitions> của BPMN 2.0;
  - id không trùng trong tệp, process id không trùng giữa các tệp, process isExecutable;
  - mỗi process (và subProcess) có startEvent và endEvent;
  - sequenceFlow trỏ tới phần tử có thật trong cùng phạm vi;
  - mọi nút có đường vào (trừ startEvent, boundaryEvent) và đường ra (trừ endEvent);
  - exclusiveGateway: `default` là một đường ra của nó, các đường ra khác có điều kiện;
  - userTask có người nhận (assignee, candidateGroups hoặc candidateUsers).
Kiểm tra đầy đủ ngữ nghĩa vẫn do Flowable làm khi khởi động (make smoke).
Thoát mã 1 nếu có lỗi.
"""
import glob
import os
import sys
import xml.etree.ElementTree as ET

BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL"
FLOWABLE = "http://flowable.org/bpmn"
NODE_TAGS = {
    "startEvent", "endEvent", "userTask", "serviceTask", "scriptTask", "sendTask",
    "receiveTask", "manualTask", "businessRuleTask", "callActivity", "subProcess",
    "exclusiveGateway", "parallelGateway", "inclusiveGateway", "eventBasedGateway",
    "intermediateCatchEvent", "intermediateThrowEvent", "boundaryEvent",
}


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
        if t == "subProcess":
            kiem_pham_vi(n, tep, loi)


def main():
    goc = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
    tep_list = sorted(glob.glob(os.path.join(goc, "apps", "*", "processes", "*.bpmn20.xml")))
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
        ids = [el.get("id") for el in root.iter() if el.get("id")]
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
    if loi:
        print("Lỗi BPMN:")
        for d in loi:
            print("  " + d)
        return 1
    print(f"OK: {len(tep_list)} tệp BPMN hợp lệ ({len(process_ids)} quy trình).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
