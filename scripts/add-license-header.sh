#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Thêm header SPDX (bản quyền + GPL-3.0-or-later, D-010) vào các tệp mã/cấu hình còn thiếu.
# Chạy trước khi commit (make license). Giữ dòng shebang (#!) và khai báo <?xml ?> ở đầu tệp.
# Tệp đã có header nhưng sai giấy phép không bị sửa tự động: make check báo để sửa tay.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/lib-spdx.sh
. scripts/lib-spdx.sh

while IFS= read -r f; do
  [ -f "$f" ] || continue
  style="$(spdx_comment_style "$f")"
  [ -n "$style" ] || continue
  spdx_has_header "$f" && continue
  tmp="$(mktemp)"
  if head -n 1 "$f" | grep -Eq '^(#!|<\?xml)'; then
    { head -n 1 "$f"; spdx_header "$style"; tail -n +2 "$f"; } > "$tmp"
  else
    { spdx_header "$style"; cat "$f"; } > "$tmp"
  fi
  cat "$tmp" > "$f" && rm "$tmp"
  echo "+ $f"
done < <(spdx_list_files)
