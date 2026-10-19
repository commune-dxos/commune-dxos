#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Thêm header SPDX vào các tệp mã/cấu hình còn thiếu. Chạy trước khi commit (make license).
# Giữ dòng shebang (#!) và khai báo <?xml ?> ở đầu tệp.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/lib-spdx.sh
. scripts/lib-spdx.sh
LICENSE_ID="${LICENSE_ID:-Apache-2.0}"

while IFS= read -r f; do
  [ -f "$f" ] || continue
  style="$(spdx_comment_style "$f")"
  [ -n "$style" ] || continue
  spdx_has_header "$f" && continue
  c="$(spdx_header_line "$style" "$LICENSE_ID")"
  tmp="$(mktemp)"
  if head -n 1 "$f" | grep -Eq '^(#!|<\?xml)'; then
    { head -n 1 "$f"; echo "$c"; tail -n +2 "$f"; } > "$tmp"
  else
    { echo "$c"; cat "$f"; } > "$tmp"
  fi
  cat "$tmp" > "$f" && rm "$tmp"
  echo "+ $f"
done < <(spdx_list_files)
