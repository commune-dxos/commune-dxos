# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gói ví dụ XNCT01 của docs/thu-tuc.md (mục "Ví dụ từ A đến Z", #106) → thư mục gói thật.

Năm tệp của gói chỉ nằm trong tài liệu, mỗi tệp là khối mã ngay sau dòng **`<tên tệp>`** ở mục B. Script
này chép đúng các khối đó ra đĩa, để:
  --kiem        make check: gói in trong tài liệu luôn qua bộ kiểm của bộ nạp (tài liệu không lỗi thời).
  --ra THU_MUC  demo cắm–rút (#108): ghi THU_MUC/xac-nhan-cu-tru/ rồi make nap-thu-tuc; xóa thư mục để rút.
Chỉ thư viện chuẩn.
"""
import argparse
import os
import re
import sys
import tempfile

GOC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TAI_LIEU = os.path.join(GOC, "docs", "thu-tuc.md")
TEN_GOI = "xac-nhan-cu-tru"
MUC = "## Ví dụ từ A đến Z"


def doc_goi(duong=TAI_LIEU):
    """→ {tên tệp: nội dung} của năm tệp trong mục ví dụ."""
    van_ban = open(duong, encoding="utf-8").read()
    if MUC not in van_ban:
        sys.exit(f"LỖI: {os.path.relpath(duong, GOC)} không còn mục '{MUC}'")
    van_ban = van_ban[van_ban.index(MUC):]
    van_ban = van_ban[:van_ban.index("\n## ", 1)] if "\n## " in van_ban[1:] else van_ban
    tep = {}
    for m in re.finditer(r"^\*\*`([\w.-]+)`\*\*.*?\n\n(`{3,4})[a-z]*\n(.*?)\n\2\n", van_ban, re.S | re.M):
        tep[m.group(1)] = m.group(3) + "\n"
    return tep


def ghi(thu_muc):
    sys.path.insert(0, os.path.join(GOC, "mot-cua", "backend"))
    import goi_thu_tuc  # noqa: E402 (đường dẫn thêm ở trên)
    tep = doc_goi()
    thieu = sorted(set(goi_thu_tuc.TEP_BAT_BUOC) - set(tep))
    if thieu:
        sys.exit(f"LỖI: mục ví dụ của docs/thu-tuc.md thiếu khối mã cho: {', '.join(thieu)}")
    dich = os.path.join(thu_muc, TEN_GOI)
    os.makedirs(dich, exist_ok=True)
    for ten in goi_thu_tuc.TEP_BAT_BUOC:
        with open(os.path.join(dich, ten), "w", encoding="utf-8") as f:
            f.write(tep[ten])
    return dich, goi_thu_tuc.kiem_goi(dich)


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    nhom = ap.add_mutually_exclusive_group(required=True)
    nhom.add_argument("--kiem", action="store_true", help="chép ra thư mục tạm và chạy bộ kiểm gói")
    nhom.add_argument("--ra", metavar="THU_MUC", help="ghi gói vào THU_MUC/xac-nhan-cu-tru/")
    a = ap.parse_args(argv)
    with tempfile.TemporaryDirectory(prefix="goi-vi-du-") as td:
        dich, (goi, loi) = ghi(td if a.kiem else a.ra)
        if loi:
            print("LỖI: gói ví dụ trong docs/thu-tuc.md không qua bộ kiểm:\n  - " + "\n  - ".join(loi), file=sys.stderr)
            return 1
        noi = "docs/thu-tuc.md" if a.kiem else dich
        print(f"OK: gói ví dụ {goi['ma']} ({noi}) hợp lệ: {goi['ten']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
