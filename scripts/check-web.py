#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Kiểm web Tầng 2 (mot-cua/web-*/) không cần Node, chạy trong `make check` (#52).

Mỗi thư mục có package.json phải: khai giấy phép GPL-3.0-or-later (D-010), ghim đúng phiên bản
(không ^, ~, *, latest, dải, URL), có package-lock.json đi kèm (lockfile commit), và có
.env.example. Giấy phép từng gói npm ghi ở DEPENDENCIES.md mục 2. Thoát mã 1 nếu sai.
"""
import json
import re
import sys
from pathlib import Path

GOC = Path(__file__).resolve().parent.parent
PHIEN_BAN_GHIM = re.compile(r"^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$")


def kiem(thu_muc: Path) -> list[str]:
    loi = []
    goi = json.loads((thu_muc / "package.json").read_text(encoding="utf-8"))
    if goi.get("license") != "GPL-3.0-or-later":
        loi.append(f"license phải là GPL-3.0-or-later, đang là {goi.get('license')!r}")
    for nhom in ("dependencies", "devDependencies"):
        for ten, pb in goi.get(nhom, {}).items():
            if not PHIEN_BAN_GHIM.match(pb):
                loi.append(f"{nhom}.{ten} = {pb!r}: phải ghim đúng một phiên bản (vd 1.2.3)")
    khoa = thu_muc / "package-lock.json"
    if not khoa.is_file():
        loi.append("thiếu package-lock.json (chạy npm install rồi commit lockfile)")
    else:
        goc_khoa = json.loads(khoa.read_text(encoding="utf-8")).get("packages", {}).get("", {})
        for nhom in ("dependencies", "devDependencies"):
            if goc_khoa.get(nhom, {}) != goi.get(nhom, {}):
                loi.append(f"package-lock.json lệch package.json ở {nhom} (chạy npm install)")
    if not (thu_muc / ".env.example").is_file():
        loi.append("thiếu .env.example (biến VITE_*)")
    return loi


def main() -> int:
    cac_web = sorted(p.parent for p in GOC.glob("mot-cua/web-*/package.json"))
    co_loi = False
    for w in cac_web:
        for dong in kiem(w):
            co_loi = True
            print(f"{w.relative_to(GOC)}: {dong}")
    if co_loi:
        return 1
    print(f"OK: {len(cac_web)} web Tầng 2 ghim phiên bản, có lockfile ({', '.join(w.name for w in cac_web) or 'chưa có'}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
