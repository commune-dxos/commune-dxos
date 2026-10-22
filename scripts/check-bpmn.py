#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Kiểm cấu trúc BPMN của mọi gói thủ tục: thu-tuc/*/quy-trinh.bpmn20.xml (make check, CI `bpmn`).

Luật kiểm nằm ở mot-cua/backend/kiem_bpmn.py, dùng chung với bộ nạp gói (nap-thu-tuc), nên
BPMN qua được CI thì bộ nạp cũng nhận. Chỉ thư viện chuẩn Python. Thoát mã 1 nếu có lỗi.
"""
import glob
import os
import sys

GOC = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
sys.path.insert(0, os.path.join(GOC, "mot-cua", "backend"))

from kiem_bpmn import kiem  # noqa: E402  (đường dẫn thêm ở trên)

MAU_TEP = os.path.join("thu-tuc", "*", "quy-trinh.bpmn20.xml")


def main():
    tep_list = sorted(glob.glob(os.path.join(GOC, MAU_TEP)))
    if not tep_list:
        print(f"Lỗi BPMN: không thấy tệp nào khớp {MAU_TEP}")
        return 1
    loi, process_ids = kiem(tep_list, GOC)
    if loi:
        print("Lỗi BPMN:")
        for d in loi:
            print("  " + d)
        return 1
    print(f"OK: {len(tep_list)} tệp BPMN hợp lệ ({len(process_ids)} quy trình).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
