#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Smoke RabbitMQ của lõi (#9), được scripts/smoke.sh `source` (dùng kiem, ma_http, GW).
#   - plugin STOMP + management bật; không có user guest;
#   - HTTP API quản trị không ra ngoài: không cổng host, không route APISIX; trong mạng nội bộ
#     chỉ tài khoản quản trị đăng nhập được, user Tầng 2 bị từ chối;
#   - vhost riêng của Tầng 2; user Tầng 2 không tag, không có quyền configure.
# Không in mật khẩu.

echo "== RabbitMQ (#9)"
rmq() { docker compose exec -T rabbitmq rabbitmqctl -q "$@"; }
VH="$DXOS_TANG2"; TANG2_USER="tang2-$DXOS_TANG2"

kiem "plugin rabbitmq_stomp và rabbitmq_management đang chạy" "rabbitmq_management rabbitmq_stomp" \
  "$(docker compose exec -T rabbitmq rabbitmq-plugins list -e -m 2>/dev/null | grep -E '^rabbitmq_(stomp|management)$' | sort | xargs)"
kiem "không có user guest" "0" "$(rmq list_users --formatter json | jq '[.[] | select(.user == "guest")] | length')"
kiem "vhost $VH của Tầng 2 tồn tại" "1" "$(rmq list_vhosts --formatter json | jq --arg v "$VH" '[.[] | select(.name == $v)] | length')"
kiem "user $TANG2_USER không có tag (không vào được management)" "[]" \
  "$(rmq list_users --formatter json | jq -c --arg u "$TANG2_USER" '.[] | select(.user == $u) | .tags')"
kiem "user $TANG2_USER: chỉ có quyền trong vhost $VH, configure rỗng" "$VH ^$ .* .*" \
  "$(rmq list_user_permissions "$TANG2_USER" --formatter json | jq -r '.[] | "\(.vhost) \(.configure) \(.write) \(.read)"' | xargs)"

kiem "management không có route qua gateway (/rabbitmq/api/overview → 404)" "404" "$(ma_http "$GW/rabbitmq/api/overview")"
kiem "management không có route qua gateway (/api/overview của RabbitMQ không tới được)" "401" \
  "$(ma_http -u "admin:x" "$GW/api/overview")"
kiem "cổng 15672 (management), 61613 (STOMP) không mở trên máy host" "000 000" \
  "$(ma_http --max-time 3 http://localhost:15672/api/overview) $(ma_http --max-time 3 http://localhost:61613/)"

# Trong mạng nội bộ: tài khoản quản trị đăng nhập được (mật khẩu đọc từ tệp agent render trong
# chính container rabbitmq), user Tầng 2 bị từ chối (mật khẩu đọc từ OpenBao trong mot-cua-worker).
kiem "trong mạng nội bộ: tài khoản quản trị vào HTTP API quản trị → 200" "200" \
  "$(docker compose exec -T rabbitmq sh -c '
     u="$(sed -n "s/^default_user = //p" /run/dxos-secrets/conf.d/20-admin.conf)"
     p="$(sed -n "s/^default_pass = //p" /run/dxos-secrets/conf.d/20-admin.conf)"
     wget -q -S -O /dev/null --header "Authorization: Basic $(printf "%s:%s" "$u" "$p" | base64)" \
       http://127.0.0.1:15672/api/overview 2>&1 | awk "/HTTP\// {print \$2}" | tail -1')"
kiem "trong mạng nội bộ: user Tầng 2 vào HTTP API quản trị → 401" "401" \
  "$(docker compose exec -T mot-cua-worker python -c 'import base64, sys, urllib.request, urllib.error
sys.path.insert(0, "/mot-cua/backend")
import bimat
c = bimat.doc("tang2/" + sys.argv[1] + "/rabbitmq")
h = {"Authorization": "Basic " + base64.b64encode((c["username"] + ":" + c["password"]).encode()).decode()}
try: print(urllib.request.urlopen(urllib.request.Request("http://rabbitmq:15672/api/overview", headers=h), timeout=5).status)
except urllib.error.HTTPError as e: print(e.code)' "$DXOS_TANG2")"
kiem "tệp tài khoản quản trị agent render: quyền 0400, chủ rabbitmq" "400 rabbitmq" \
  "$(docker compose exec -T rabbitmq stat -c '%a %U' /run/dxos-secrets/conf.d/20-admin.conf)"
