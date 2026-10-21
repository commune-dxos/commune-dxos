#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# Dịch vụ một lần `garage-secrets` của lõi: sinh bí mật của Garage nếu chưa có rồi thoát.
#   rpc_secret   32 byte ngẫu nhiên dạng hex (khóa mạng RPC giữa các nút)
#   admin_token  32 byte ngẫu nhiên dạng hex (Bearer token của API quản trị)
# Ghi vào volume garage-secrets, quyền 600 (Garage từ chối tệp bí mật ai cũng đọc được).
# Đã có thì giữ nguyên, nên chạy lại bao nhiêu lần cũng không đổi khóa của cụm.
# Bí mật không bao giờ được in ra log. TODO(#10): sinh và giữ trong OpenBao.
set -eu
DIR="${GARAGE_SECRETS_DIR:-/run/garage-secrets}"
umask 077
mkdir -p "$DIR"
for ten in rpc_secret admin_token; do
  if [ -s "$DIR/$ten" ]; then
    echo "garage-secrets: giữ $ten đã có"
  else
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$DIR/$ten.tmp"
    mv "$DIR/$ten.tmp" "$DIR/$ten"
    echo "garage-secrets: đã sinh $ten"
  fi
  chmod 600 "$DIR/$ten"
done
