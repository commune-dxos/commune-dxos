#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Hàm dùng chung cho check-license.sh và add-license-header.sh.
# Giấy phép của dự án: GPL-3.0-or-later từ sau v0.2.0 (D-010); v0.0.1–v0.2.0 là Apache-2.0.
# Bài học OLP 2025: 7/11 đội bị −5 PoF vì thiếu giấy phép trong từng tệp mã,
# nên quét mọi tệp có thể chứa chú thích, không chỉ mã nguồn.

SPDX_LICENSE_ID="GPL-3.0-or-later"
SPDX_COPYRIGHT="2026 DTU_DZ_2"

# Liệt kê tệp do git quản lý (kể cả chưa add), bỏ thư mục bên thứ ba và sản phẩm build.
spdx_list_files() {
  git ls-files --cached --others --exclude-standard \
    | grep -Ev '(^|/)(node_modules|vendor|third_party|build|dist|\.venv|venv|__pycache__|\.next|coverage)/' \
    || true
}

# In kiểu chú thích của tệp: hash | dash | slash | block | xml.
# Không in gì = bỏ qua (.json không có chú thích, tài liệu .md, LICENSE…).
spdx_comment_style() {
  local f="$1" base
  base="$(basename "$f")"
  case "$base" in
    Dockerfile|Dockerfile.*|*.Dockerfile|Containerfile) echo hash; return ;;
    Makefile|*.mk|.env.example|*.env.example|*.env) echo hash; return ;;
  esac
  case "$f" in
    *.sh|*.bash|*.py|*.yml|*.yaml|*.toml|*.hcl|*.conf|*.cfg|*.ini|*.properties) echo hash ;;
    *.sql) echo dash ;;
    *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs) echo slash ;;
    *.css|*.scss) echo block ;;
    *.xml|*.bpmn|*.html|*.svg) echo xml ;;
    *) ;;
  esac
}

# REUSE-IgnoreStart (các dòng dưới là mẫu header, không phải header của tệp này)
# Bọc một dòng nội dung trong chú thích theo kiểu của tệp.
spdx_comment() {
  local style="$1" text="$2"
  case "$style" in
    hash)  echo "# $text" ;;
    dash)  echo "-- $text" ;;
    slash) echo "// $text" ;;
    block) echo "/* $text */" ;;
    xml)   echo "<!-- $text -->" ;;
  esac
}

# Header 2 dòng: bản quyền rồi giấy phép (định dạng REUSE/SPDX).
spdx_header() {
  spdx_comment "$1" "SPDX-FileCopyrightText: $SPDX_COPYRIGHT"
  spdx_comment "$1" "SPDX-License-Identifier: $SPDX_LICENSE_ID"
}

# Header nằm trong 5 dòng đầu. Không có dòng giấy phép nào thì là thiếu.
spdx_has_header() {
  head -n 5 "$1" | grep -q 'SPDX-License-Identifier'
}

# Header đúng: giấy phép đúng GPL-3.0-or-later và có dòng bản quyền.
# Tệp còn Apache-2.0 (giấy phép trước D-010) hay giấy phép khác là sai.
spdx_header_ok() {
  local dau
  dau="$(head -n 5 "$1")"
  grep -Eq "SPDX-License-Identifier: ${SPDX_LICENSE_ID}([[:space:]]|-->|\*/|$)" <<<"$dau" \
    && ! grep 'SPDX-License-Identifier:' <<<"$dau" | grep -vq "SPDX-License-Identifier: ${SPDX_LICENSE_ID}" \
    && grep -q 'SPDX-FileCopyrightText: ' <<<"$dau"
}
# REUSE-IgnoreEnd
