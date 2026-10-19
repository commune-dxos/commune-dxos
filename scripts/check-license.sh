#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Kiểm tra mọi tệp mã và cấu hình đều có dòng SPDX-License-Identifier (PoF tiêu chí 2).
# Quét: Dockerfile, Makefile, .env.example, .sh, .py, .yml/.yaml, .toml, .conf, .ini,
# .properties, .sql, .ts/.tsx/.js, .css, .xml/.bpmn. Bỏ qua .json và thư mục bên thứ ba.
# Dùng trong CI. Thoát mã 1 nếu thiếu.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/lib-spdx.sh
. scripts/lib-spdx.sh

checked=0
missing=""
while IFS= read -r f; do
  [ -f "$f" ] || continue
  [ -n "$(spdx_comment_style "$f")" ] || continue
  checked=$((checked + 1))
  spdx_has_header "$f" || missing="$missing$f"$'\n'
done < <(spdx_list_files)

if [ -n "$missing" ]; then
  echo "Thiếu header SPDX ở các tệp sau — chạy: make license"
  printf '%s' "$missing"
  exit 1
fi
echo "OK: $checked tệp mã/cấu hình đều có SPDX header."
