# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Hook MkDocs của trang tài liệu (D-009 hướng 2, #32). Khai trong mkdocs.yml (`hooks:`).

Ba việc:
1. Trang "Danh mục thủ tục" sinh lúc build từ mọi gói thu-tuc/<goi>/: đọc và kiểm bằng đúng
   bộ kiểm của bộ nạp (mot-cua/backend/goi_thu_tuc.py), nên trang khớp những gì `make nap-thu-tuc`
   nạp. Thêm gói = trang tự có dòng mới và mục điều hướng mới; gói lỗi → cảnh báo, `--strict` dừng.
2. Đưa vào site một số tệp nằm ngoài docs/ mà không chép: README của từng gói (trang
   thu-tuc/<goi>/) kèm BPMN, JSON Schema, dữ liệu mẫu; mot-cua/README.md, CONTRIBUTING.md,
   CHANGELOG.md (bảng NGOAI_DOCS).
3. Neo tiêu đề tính như GitHub (_neo_github), để link `tệp.md#mục` viết cho GitHub chạy đúng trên site.
4. Sửa link tương đối: link tới tệp có trên site → link trong site; link tới tệp khác trong repo
   → GitHub (nhánh main, cùng nhánh deploy site). Tệp nguồn giữ link tương đối để vẫn đọc được
   trên GitHub.
"""

import logging
import os
import posixpath
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
from urllib.parse import quote, unquote

from mkdocs.structure.files import File

log = logging.getLogger("mkdocs.hooks.tai_lieu")

REPO = "https://github.com/commune-dxos/commune-dxos"
NHANH_LINK = "main"     # link tới mã: nhánh deploy site
NHANH_SUA = "develop"   # nút "Sửa trang": PR vào develop (CONTRIBUTING.md)

DANH_MUC = "danh-muc-thu-tuc.md"
MUC_NAV_DANH_MUC = "Người dân / cán bộ"

# Tệp ngoài docs/ hiện trên site: đường dẫn trong repo → đường dẫn trên site.
NGOAI_DOCS = {
    "mot-cua/README.md": "mot-cua.md",
    "mot-cua/web-cong-dan/README.md": "cong-cong-dan.md",
    "CONTRIBUTING.md": "dong-gop.md",
    "CHANGELOG.md": "thay-doi.md",
}

BPMN_NS = "{http://www.omg.org/spec/BPMN/20100524/MODEL}"

_goc = ""          # thư mục gốc repo
_ban_do = {}       # đường dẫn repo → src_uri trên site (tệp ngoài docs/ + docs/)
_goi = []          # [(tên thư mục, dict gói | None, lỗi)]


def _nap_goi_thu_tuc():
    """Kiểm mọi gói bằng bộ kiểm của bộ nạp (chỉ thư viện chuẩn, không cần Docker)."""
    backend = os.path.join(_goc, "mot-cua", "backend")
    if backend not in sys.path:
        sys.path.insert(0, backend)
    import goi_thu_tuc  # noqa: E402 (đường dẫn thêm ở trên)

    kq = []
    for ten, duong in goi_thu_tuc.quet(os.path.join(_goc, "thu-tuc")):
        goi, loi = goi_thu_tuc.kiem_goi(duong)
        if loi:
            log.warning("Gói thu-tuc/%s lỗi, không đưa vào danh mục:\n  - %s", ten, "\n  - ".join(loi))
        kq.append((ten, goi, loi))
    return kq


def _neo_github(van_ban, sep):
    """Neo tiêu đề như GitHub: chữ thường, giữ chữ có dấu, bỏ dấu câu, cách → '-'.
    Khác slugify mặc định: giữ chữ trong `<ma>` của mã inline (GitHub coi là chữ, không phải thẻ)."""
    s = unicodedata.normalize("NFC", van_ban).strip().lower()
    return re.sub(r"[^\w\- ]", "", s).replace(" ", sep)


def on_config(config):
    global _goc, _ban_do, _goi
    config.mdx_configs.setdefault("toc", {})["slugify"] = _neo_github
    _goc = os.path.dirname(os.path.abspath(config.config_file_path))
    _goi = _nap_goi_thu_tuc()
    _ban_do = dict(NGOAI_DOCS)
    _ban_do["thu-tuc"] = DANH_MUC  # link "../thu-tuc/" → trang danh mục
    for ten, _, _ in _goi:
        thu_muc = os.path.join(_goc, "thu-tuc", ten)
        for tep in sorted(os.listdir(thu_muc)):
            if os.path.isfile(os.path.join(thu_muc, tep)) and not tep.startswith("."):
                _ban_do[f"thu-tuc/{ten}/{tep}"] = f"thu-tuc/{ten}/" + ("index.md" if tep == "README.md" else tep)
    # Mỗi gói hợp lệ một mục điều hướng ngay dưới trang danh mục.
    for muc in config.nav or []:
        if isinstance(muc, dict) and MUC_NAV_DANH_MUC in muc:
            muc[MUC_NAV_DANH_MUC] += [{f"{g['ma']} · {g['ten']}": f"thu-tuc/{ten}/index.md"}
                                      for ten, g, _ in _goi if g]
    return config


def on_files(files, config):
    for repo, src in _ban_do.items():
        duong = os.path.join(_goc, repo)
        if os.path.isfile(duong):
            files.append(File.generated(config, src, abs_src_path=duong))
    files.append(File.generated(config, DANH_MUC, content=_trang_danh_muc()))
    for f in files.documentation_pages():
        _ban_do.setdefault(f"docs/{f.src_uri}", f.src_uri)
    for f in files.static_pages():
        _ban_do.setdefault(f"docs/{f.src_uri}", f.src_uri)
    for f in files.media_files():
        _ban_do.setdefault(f"docs/{f.src_uri}", f.src_uri)
    return files


# ---------------------------------------------------------------- trang danh mục

def _o(s):
    """Giá trị trong một ô bảng Markdown."""
    return str(s).replace("|", "\\|").replace("\n", " ")


def _thoi_han(n):
    return "Trong ngày tiếp nhận" if n == 0 else f"{n} ngày làm việc"


def _le_phi(n):
    return "Không thu" if n == 0 else f"{n:,} đồng".replace(",", ".")


def _cac_buoc(ten):
    """Tên các userTask theo thứ tự khai trong BPMN."""
    cay = ET.parse(os.path.join(_goc, "thu-tuc", ten, "quy-trinh.bpmn20.xml"))
    return [t.get("name") or t.get("id") for t in cay.iter(f"{BPMN_NS}userTask")]


def _trang_danh_muc():
    hop_le = [(ten, g) for ten, g, _ in _goi if g]
    dong = [
        "---",
        "hide:",
        "  - toc",  # bảng nhiều cột, cần cả bề ngang
        "---",
        "",
        "# Danh mục thủ tục hành chính",
        "",
        "Trang này **sinh tự động** mỗi lần build tài liệu, từ các gói `thu-tuc/<goi>/` trong repo, "
        "bằng đúng bộ kiểm mà bộ nạp `make nap-thu-tuc` dùng. Thêm một gói (xem "
        "[Thêm một thủ tục mới](thu-tuc.md)) thì trang có thêm dòng mới, không sửa trang này. "
        f"Hiện có **{len(hop_le)}** thủ tục.",
        "",
        "!!! note \"Giá trị mẫu\"",
        "    Thời hạn, lệ phí, căn cứ pháp lý trong các gói là dữ liệu mẫu để thử hệ thống, "
        "không phải tư vấn pháp lý.",
        "",
        "| Mã | Thủ tục | Lĩnh vực | Thời hạn | Lệ phí | Căn cứ pháp lý | Tệp của gói |",
        "|---|---|---|---|---|---|---|",
    ]
    for ten, g in hop_le:
        goc = f"thu-tuc/{ten}"
        tc = _o(g["ten"]) + ("" if g["cong_khai"] else " _(không công khai)_")
        can_cu = "<br>".join(_o(c.strip()) for c in g["can_cu_phap_ly"].split("; "))
        dong.append(
            f"| `{g['ma']}` | [{tc}]({goc}/index.md) | {_o(g['ten_linh_vuc'])} | {_thoi_han(g['so_ngay_xu_ly'])} "
            f"| {_le_phi(g['le_phi'])} | {can_cu} "
            f"| [Quy trình BPMN]({goc}/quy-trinh.bpmn20.xml)<br>[Thành phần hồ sơ (JSON Schema)]({goc}/thanh-phan-ho-so.schema.json) |")
    for ten, g in hop_le:
        goc = f"thu-tuc/{ten}"
        dong += [
            "",
            f"## {g['ma']} · {g['ten']}",
            "",
            f"- **Lĩnh vực:** {g['ten_linh_vuc']} (`{g['linh_vuc']}`)",
            f"- **Thời hạn:** {_thoi_han(g['so_ngay_xu_ly'])}",
            f"- **Lệ phí:** {_le_phi(g['le_phi'])}" + (f" ({g['ghi_chu_le_phi']})" if g["ghi_chu_le_phi"] else ""),
            f"- **Các bước xử lý** (quy trình `{g['quy_trinh']}`): " + " → ".join(_cac_buoc(ten)),
            f"- **Gói:** [`{goc}/`]({goc}/index.md) · [dữ liệu mẫu giả]({goc}/du-lieu-mau.json)",
            "",
            "| Thành phần hồ sơ | Bắt buộc | Số tệp tối thiểu |",
            "|---|---|---|",
        ]
        for tp in g["thanh_phan"]:
            ten_tp = _o(tp["ten"]) + (f"<br><small>{_o(tp['ghi_chu'])}</small>" if tp["ghi_chu"] else "")
            dong.append(f"| {ten_tp} | {'có' if tp['bat_buoc'] else 'không'} | "
                        f"{tp['so_luong'] if tp['bat_buoc'] else 0} |")
    loi = [ten for ten, g, _ in _goi if not g]
    if loi:
        dong += ["", "!!! warning \"Gói lỗi, chưa có trong danh mục\"",
                 "    " + ", ".join(f"`thu-tuc/{t}/`" for t in loi)]
    return "\n".join(dong) + "\n"


# ---------------------------------------------------------------- sửa link

RE_RAO_CODE = re.compile(r"^[ \t]*(`{3,}|~{3,})[^\n]*\n.*?^[ \t]*\1[ \t]*$", re.M | re.S)
RE_LINK_MD = re.compile(r"(\]\()([^)\s]+)((?:\s+\"[^\"]*\")?\))")
RE_LINK_HTML = re.compile(r"(\b(?:src|href)=\")([^\"]+)(\")")
RE_SCHEME = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*:")


def _repo_cua_trang(page):
    for repo, src in _ban_do.items():
        if src == page.file.src_uri and not repo.startswith("docs/"):
            return repo
    return "docs/" + page.file.src_uri


def _sua_link(dich, repo_trang, page, files, html):
    """Link markdown: tính theo tệp nguồn (MkDocs tự đổi sang URL). Link trong thẻ HTML
    (`<img src>`): MkDocs không đổi, nên tính theo URL trang (use_directory_urls)."""
    if not dich or dich.startswith(("#", "/")) or RE_SCHEME.match(dich):
        return dich
    duong, co_neo, neo = dich.partition("#")
    repo = posixpath.normpath(posixpath.join(posixpath.dirname(repo_trang), unquote(duong)))
    if repo == ".." or repo.startswith("../"):
        return dich
    src = _ban_do.get(repo) or _ban_do.get(posixpath.join(repo, "README.md"))
    if src and html:
        moi = posixpath.relpath(files.get_file_from_path(src).url, posixpath.dirname(page.url) or ".")
    elif src:
        moi = posixpath.relpath(src, posixpath.dirname(page.file.src_uri) or ".")
    else:
        loai = "tree" if os.path.isdir(os.path.join(_goc, repo)) else "blob"
        moi = f"{REPO}/{loai}/{NHANH_LINK}/{quote(repo)}"
    return moi + co_neo + neo


def on_page_markdown(markdown, page, config, files):
    repo_trang = _repo_cua_trang(page)
    if page.file.src_uri == DANH_MUC:
        page.edit_url = None
        return markdown
    if not repo_trang.startswith("docs/"):
        page.edit_url = f"{REPO}/edit/{NHANH_SUA}/{repo_trang}"

    def sua_md(m):
        return m.group(1) + _sua_link(m.group(2), repo_trang, page, files, False) + m.group(3)

    def sua_html(m):
        return m.group(1) + _sua_link(m.group(2), repo_trang, page, files, True) + m.group(3)

    def sua(doan):
        return RE_LINK_HTML.sub(sua_html, RE_LINK_MD.sub(sua_md, doan))

    phan, dau = [], 0
    for m in RE_RAO_CODE.finditer(markdown):
        phan += [sua(markdown[dau:m.start()]), m.group(0)]
        dau = m.end()
    phan.append(sua(markdown[dau:]))
    return "".join(phan)

