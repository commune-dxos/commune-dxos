#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Hàm dùng chung cho check-license.sh và add-license-header.sh.
# Bài học OLP 2025: 7/11 đội bị −5 PoF vì thiếu giấy phép trong từng tệp mã,
# nên quét mọi tệp có thể chứa chú thích, không chỉ mã nguồn.

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
    Makefile|*.mk|.env.example|*.env.example) echo hash; return ;;
  esac
  case "$f" in
    *.sh|*.bash|*.py|*.yml|*.yaml|*.toml|*.conf|*.cfg|*.ini|*.properties) echo hash ;;
    *.sql) echo dash ;;
    *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs) echo slash ;;
    *.css|*.scss) echo block ;;
    *.xml|*.bpmn|*.bpmn20.xml|*.html|*.svg) echo xml ;;
    *) ;;
  esac
}

spdx_header_line() {
  local style="$1" id="$2"
  case "$style" in
    hash)  echo "# SPDX-License-Identifier: $id" ;;
    dash)  echo "-- SPDX-License-Identifier: $id" ;;
    slash) echo "// SPDX-License-Identifier: $id" ;;
    block) echo "/* SPDX-License-Identifier: $id */" ;;
    xml)   echo "<!-- SPDX-License-Identifier: $id -->" ;;
  esac
}

# Header hợp lệ khi nằm trong 5 dòng đầu.
spdx_has_header() {
  head -n 5 "$1" | grep -q 'SPDX-License-Identifier'
}
