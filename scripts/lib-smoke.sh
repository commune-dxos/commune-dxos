#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Hàm dùng chung cho scripts/smoke.sh và mot-cua/tests/smoke.sh.
# Không in mật khẩu hay token ra màn hình.

# Dùng trong các tệp `source` thư viện này (smoke của nền tảng và bộ máy một cửa).
# shellcheck disable=SC2034
GW="http://localhost:${APISIX_PORT:-9080}"
KC="http://localhost:${KEYCLOAK_PORT:-8080}"
WF="http://localhost:${FLOWABLE_PORT:-8090}/flowable-rest/service"
SMOKE_DAT=0
SMOKE_TRUOT=0

# kiem <mô tả> <mong đợi> <thực tế>
kiem() {
  if [ "$2" = "$3" ]; then
    SMOKE_DAT=$((SMOKE_DAT + 1)); printf '  ĐẠT   %s\n' "$1"
  else
    SMOKE_TRUOT=$((SMOKE_TRUOT + 1)); printf '  TRƯỢT %s (mong đợi: %s, thực tế: %s)\n' "$1" "$2" "$3"
  fi
}

tong_ket() {
  echo "== Kết quả: $SMOKE_DAT đạt, $SMOKE_TRUOT trượt"
  [ "$SMOKE_TRUOT" -eq 0 ]
}

# Không lệnh nào được treo smoke: curl tối đa SMOKE_CURL_GIAY (120) giây (--max-time đặt sau trong lời gọi
# thì thắng), lệnh khác bọc bằng gioi_han. Hết giờ → lệnh lỗi, kiểm tra liên quan báo TRƯỢT.
curl() { command curl --max-time "${SMOKE_CURL_GIAY:-120}" "$@"; }
# gioi_han <giây> <lệnh…>: timeout của coreutils (máy không có thì chạy thẳng)
gioi_han() {
  if command -v timeout > /dev/null; then timeout "$@"; else shift; "$@"; fi
}
# rmq <lệnh rabbitmqctl…>: trong container rabbitmq, tối đa 30 giây. list_queues mặc định không có hạn và
# có lúc treo ngay sau khi broker khởi động lại (queue quorum đang bầu leader).
rmq() { gioi_han 45 docker compose exec -T rabbitmq rabbitmqctl -q --timeout 30 "$@" < /dev/null; }

# ma_http [tham số curl…] <url> → mã HTTP
ma_http() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

# header_http <tên header> [tham số curl…] <url> → giá trị header của response (rỗng nếu không có)
header_http() {
  local h="$1"; shift
  curl -s -D - -o /dev/null "$@" | tr -d '\r' | awk -F': ' -v h="$h" 'tolower($1) == tolower(h) {print $2}'
}

# sql <câu lệnh> → kết quả dạng text (chạy bằng superuser trong container postgres)
sql() {
  docker compose exec -T postgres psql -XqtA -v ON_ERROR_STOP=1 \
    -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-commune}" -c "$1"
}

# sql_loi <câu lệnh> → "ok" nếu chạy được, ngược lại thông báo lỗi PostgreSQL (dòng ERROR)
sql_loi() {
  local out
  if out="$(sql "$1" 2>&1)"; then echo ok; else grep -m1 -oE 'ERROR: +[^:]+' <<<"$out" | sed 's/ERROR: *//' ; fi
}

# Đoạn bash chạy trong container keycloak: đăng nhập kcadm bằng tài khoản quản trị khởi
# tạo (mật khẩu đọc từ tệp OpenBao trong chính container, không đi qua máy host), lưu cấu
# hình tạm. Nháy đơn có chủ ý: biến được mở rộng trong container, không phải trên host.
# shellcheck disable=SC2016
_KC_LOGIN='cfg=/tmp/smoke-kcadm.config
[ -s "$cfg" ] || /opt/keycloak/bin/kcadm.sh config credentials --config "$cfg" \
  --server http://localhost:8080 --realm master \
  --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$(< /run/dxos-secrets/admin_password)" >/dev/null 2>&1'

# kc <lệnh kcadm…> : chạy kcadm.sh trong container keycloak
kc() {
  docker compose exec -T keycloak bash -c "$_KC_LOGIN"'
/opt/keycloak/bin/kcadm.sh "$@" --config "$cfg" 2> >(sed "/^$/d" >&2)' kc "$@"
}

# dat_mat_khau <username> <mật khẩu> : mật khẩu đi qua stdin, không nằm trong tham số lệnh
dat_mat_khau() {
  printf '%s\n' "$2" | docker compose exec -T keycloak bash -c "$_KC_LOGIN"'
IFS= read -r pw
/opt/keycloak/bin/kcadm.sh set-password --config "$cfg" -r dxos --username "$1" --new-password "$pw" >/dev/null' kc "$1"
}

# lay_token <username> <mật khẩu> → JSON trả về từ token endpoint (client dev dxos_cli)
lay_token() {
  curl -s "$KC/realms/dxos/protocol/openid-connect/token" \
    -d grant_type=password -d client_id=dxos_cli \
    --data-urlencode "username=$1" --data-urlencode "password=$2"
}

# wf <đường dẫn> [tham số curl…] → JSON từ Flowable REST (Basic auth rest-admin, cổng debug
# 127.0.0.1). Có tham số -d thì là POST. FLOWABLE_ADMIN_PASSWORD do scripts/smoke.sh đọc từ
# tệp bí mật trong container flowable (nguồn là OpenBao), chỉ giữ trong biến của tiến trình.
wf() {
  local duong="$1"; shift
  curl -s -u "rest-admin:${FLOWABLE_ADMIN_PASSWORD:?}" -H 'Content-Type: application/json' "$@" "$WF/$duong"
}

# jwt_payload <token> → JSON phần payload
jwt_payload() {
  local p="${1#*.}"; p="${p%%.*}"
  p="$(tr '_-' '/+' <<<"$p")"
  while [ $(( ${#p} % 4 )) -ne 0 ]; do p="$p="; done
  base64 -d <<<"$p" 2>/dev/null
}
