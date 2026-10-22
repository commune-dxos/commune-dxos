#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# make demo-users: đặt một mật khẩu chung cho người dùng mẫu (dữ liệu giả) của realm `dxos`
# để thử tay từng vai trò sau `make up`. Realm không chứa mật khẩu; `make smoke` đặt mật khẩu
# ngẫu nhiên, nên chạy lệnh này SAU smoke.
# Mật khẩu: biến DXOS_DEMO_PASSWORD (đặt khi gọi lệnh, không ghi vào .env), không có thì sinh
# ngẫu nhiên và in ra MỘT lần. Chỉ dùng trên máy dev với dữ liệu mẫu.
# Dùng: scripts/demo-users.sh [username…]   (mặc định: người dùng mẫu của mot-cua)
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "Thiếu .env — chạy: cp .env.example .env"; exit 1; }
set -a
# shellcheck source=.env.example
. ./.env
set +a
export COMPOSE_PROFILES=core
# shellcheck source=scripts/lib-smoke.sh
. scripts/lib-smoke.sh

[ "$#" -gt 0 ] || set -- congdan01 congdan02 canbo01 canbo02 canbo03 lanhdao01
pw="${DXOS_DEMO_PASSWORD:-}"
in_mat_khau=0
if [ -z "$pw" ]; then
  pw="thu-$(od -An -N6 -tx1 /dev/urandom | tr -d ' \n')"
  in_mat_khau=1
fi

for u in "$@"; do
  dat_mat_khau "$u" "$pw"
  echo "  đã đặt mật khẩu: $u"
done

[ "$in_mat_khau" -eq 0 ] || echo "Mật khẩu chung (dữ liệu mẫu, chỉ máy dev): $pw"
cat <<EOF
Đăng nhập thử: http://localhost:${KEYCLOAK_PORT:-8080}/realms/dxos/account
Cán bộ và lãnh đạo phải cài OTP (FreeOTP, Google Authenticator…) ở lần đăng nhập đầu.
Token công dân cho curl:
  curl -s http://localhost:${KEYCLOAK_PORT:-8080}/realms/dxos/protocol/openid-connect/token \\
    -d grant_type=password -d client_id=dxos_cli -d username=congdan01 -d password='<mật khẩu>' | jq -r .access_token
EOF
