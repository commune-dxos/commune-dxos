#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# REUSE-IgnoreStart
# Kiểm tra mọi tệp mã và cấu hình đều có header SPDX đúng giấy phép dự án (PoF tiêu chí 2, D-010):
# `SPDX-FileCopyrightText` + `SPDX-License-Identifier: GPL-3.0-or-later` trong 5 dòng đầu.
# Quét: Dockerfile, Makefile, .env.example, *.env, .sh, .py, .yml/.yaml, .toml, .hcl, .conf, .ini,
# .properties, .sql, .ts/.tsx/.js, .css, .xml/.bpmn/.html/.svg. Tệp không có chú thích (.json, .md,
# ảnh) không bắt buộc header (khai trong REUSE.toml), nhưng nếu có header thì cũng phải đúng.
# Bỏ qua thư mục bên thứ ba. Dùng trong CI. Thoát mã 1 nếu thiếu hoặc sai.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/lib-spdx.sh
. scripts/lib-spdx.sh

checked=0
missing=""
wrong=""
while IFS= read -r f; do
  [ -f "$f" ] || continue
  if [ -n "$(spdx_comment_style "$f")" ]; then
    checked=$((checked + 1))
    if ! spdx_has_header "$f"; then
      missing="$missing$f"$'\n'
      continue
    fi
  else
    spdx_has_header "$f" || continue
    checked=$((checked + 1))
  fi
  spdx_header_ok "$f" || wrong="$wrong$f: $(head -n 5 "$f" | grep -m1 -o 'SPDX-License-Identifier: [^ >*]*' || true)"$'\n'
done < <(spdx_list_files)

if [ -n "$missing" ]; then
  echo "Thiếu header SPDX ở các tệp sau — chạy: make license"
  printf '%s' "$missing"
fi
if [ -n "$wrong" ]; then
  echo "Header SPDX sai ở các tệp sau — cần 'SPDX-FileCopyrightText: $SPDX_COPYRIGHT' và 'SPDX-License-Identifier: $SPDX_LICENSE_ID' (D-010):"
  printf '%s' "$wrong"
fi
[ -z "$missing$wrong" ] || exit 1
echo "OK: $checked tệp có header SPDX đúng ($SPDX_LICENSE_ID)."
# REUSE-IgnoreEnd
