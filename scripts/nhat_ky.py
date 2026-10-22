#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Sinh CHANGELOG và ghi chú phát hành bằng git-cliff (D-009 hướng 4, #36). Chỉ dùng thư viện chuẩn.

  nhat_ky.py nhat-ky [x.y.z]   Viết lại mục `## [Unreleased]` của CHANGELOG.md từ commit sau tag mới
                               nhất. Có x.y.z: các commit đó thành mục `## [x.y.z] - hôm nay`, thêm
                               `## [Unreleased]` trống ở trên và cập nhật link so sánh cuối tệp.
  nhat_ky.py ghi-chu x.y.z     In ghi chú phát hành của vx.y.z ra stdout (thân GitHub Release). Tag đã
                               có: commit từ tag liền trước tới tag đó; chưa có: xem trước từ tag mới
                               nhất tới HEAD.

Vì sao không gọi thẳng `git-cliff -o CHANGELOG.md`:
  - phần v0.0.1, v0.1.0 viết tay trước khi có git-cliff phải giữ nguyên, nên chỉ thay đúng mục
    `[Unreleased]` (hoặc chèn mục phiên bản mới) và để nguyên mọi mục đã phát hành;
  - tag phát hành nằm ở merge commit trên `main` (PR develop → main), không phải tổ tiên của
    `develop`, nên git-cliff chạy trên develop không thấy tag. Khoảng `<tag>..HEAD` vẫn đúng vì
    merge commit có commit cuối của develop làm cha thứ hai.
Biến môi trường GIT_CLIFF: đường dẫn git-cliff (mặc định `git-cliff` trong PATH).
"""

from __future__ import annotations

import datetime
import os
import re
import subprocess
import sys
from pathlib import Path

GOC = Path(__file__).resolve().parent.parent
CHANGELOG = GOC / "CHANGELOG.md"
REPO_URL = "https://github.com/commune-dxos/commune-dxos"
PHIEN_BAN_RE = re.compile(r"^\d+\.\d+\.\d+$")
MUC_PHAT_HANH_RE = re.compile(r"^## \[\d+\.\d+\.\d+\]", re.M)


def loi(thong_bao: str) -> None:
    print(f"LỖI: {thong_bao}", file=sys.stderr)
    sys.exit(1)


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=GOC, check=True, capture_output=True, text=True).stdout


def cac_tag() -> list[str]:
    """Tag vX.Y.Z, mới nhất trước (theo số phiên bản, không theo ngày)."""
    return [t for t in git("tag", "--list", "v*", "--sort=-v:refname").split() if PHIEN_BAN_RE.match(t[1:])]


def git_cliff(khoang: str | None, *them: str, ghi_chu: bool = False) -> str:
    lenh = [os.environ.get("GIT_CLIFF", "git-cliff"), "--config", str(GOC / "cliff.toml"), *them]
    if khoang:
        lenh.append(khoang)
    env = dict(os.environ, NO_COLOR="1")
    if ghi_chu:
        env["GHI_CHU_PHAT_HANH"] = "1"
    try:
        kq = subprocess.run(lenh, cwd=GOC, env=env, capture_output=True, text=True)
    except FileNotFoundError:
        loi("chưa có git-cliff — python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements-phat-hanh.txt, "
            "rồi chạy với GIT_CLIFF=.venv/bin/git-cliff")
    if kq.returncode != 0:
        sys.stderr.write(kq.stderr)
        loi("git-cliff chạy lỗi")
    return kq.stdout.strip("\n") + "\n"


def nhat_ky(phien_ban: str | None) -> None:
    tags = cac_tag()
    if phien_ban and f"v{phien_ban}" in tags:
        loi(f"tag v{phien_ban} đã có; mục của phiên bản đã phát hành không sinh lại")
    khoang = f"{tags[0]}..HEAD" if tags else None
    # Không dùng --unreleased: cờ này bỏ qua khoảng commit truyền vào. Khoảng không chứa tag nên ra [Unreleased].
    sinh = git_cliff(khoang, *(["--tag", f"v{phien_ban}"] if phien_ban else []))
    if phien_ban:
        sinh = "## [Unreleased]\n\n" + sinh

    noi_dung = CHANGELOG.read_text(encoding="utf-8")
    dau = noi_dung.find("## [Unreleased]")
    if dau < 0:
        loi("CHANGELOG.md không có mục `## [Unreleased]`")
    sau = MUC_PHAT_HANH_RE.search(noi_dung, dau)
    cuoi = sau.start() if sau else len(noi_dung)
    noi_dung = noi_dung[:dau] + sinh + "\n" + noi_dung[cuoi:]

    if phien_ban:
        # Link so sánh cuối tệp theo Keep a Changelog: [Unreleased] từ tag mới, thêm dòng cho x.y.z.
        truoc = tags[0] if tags else None
        dong_moi = f"[{phien_ban}]: {REPO_URL}/compare/{truoc}...v{phien_ban}" if truoc \
            else f"[{phien_ban}]: {REPO_URL}/releases/tag/v{phien_ban}"
        noi_dung, so = re.subn(r"^\[Unreleased\]: .*$",
                               f"[Unreleased]: {REPO_URL}/compare/v{phien_ban}...HEAD\n{dong_moi}",
                               noi_dung, count=1, flags=re.M)
        if not so:
            noi_dung = noi_dung.rstrip("\n") + f"\n\n[Unreleased]: {REPO_URL}/compare/v{phien_ban}...HEAD\n{dong_moi}\n"

    CHANGELOG.write_text(noi_dung, encoding="utf-8")
    muc = f"[{phien_ban}] - {datetime.date.today():%Y-%m-%d}" if phien_ban else "[Unreleased]"
    print(f"OK: CHANGELOG.md mục {muc} sinh từ {khoang or 'toàn bộ lịch sử'}")


def ghi_chu(phien_ban: str) -> None:
    tags = cac_tag()
    tag = f"v{phien_ban}"
    if tag in tags:
        i = tags.index(tag)
        if i + 1 == len(tags):
            # git-cliff chỉ nhận khoảng `a..b`; tag đầu tiên (v0.0.1) có ghi chú viết tay trong CHANGELOG.md.
            loi(f"{tag} là tag đầu tiên, không có tag trước để lấy khoảng commit; xem CHANGELOG.md")
        sys.stdout.write(git_cliff(f"{tags[i + 1]}..{tag}", ghi_chu=True))
    else:
        khoang = f"{tags[0]}..HEAD" if tags else None
        sys.stdout.write(git_cliff(khoang, "--tag", tag, ghi_chu=True))


def main(argv: list[str]) -> None:
    if not argv or argv[0] not in ("nhat-ky", "ghi-chu") or len(argv) > 2:
        loi("dùng: nhat_ky.py nhat-ky [x.y.z] | nhat_ky.py ghi-chu x.y.z")
    phien_ban = argv[1].removeprefix("v") if len(argv) == 2 and argv[1] else None
    if phien_ban and not PHIEN_BAN_RE.match(phien_ban):
        loi(f"phiên bản `{argv[1]}` không đúng dạng x.y.z")
    if argv[0] == "nhat-ky":
        nhat_ky(phien_ban)
    elif not phien_ban:
        loi("ghi-chu cần phiên bản: nhat_ky.py ghi-chu x.y.z")
    else:
        ghi_chu(phien_ban)


if __name__ == "__main__":
    main(sys.argv[1:])
