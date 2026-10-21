#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# make smoke: kiểm tra lõi Tầng 1 đang chạy (sau `make up`) rồi gọi smoke của ứng dụng
# apps/<DXOS_APP>/tests/smoke.sh nếu có. Không xóa dữ liệu; chỉ thêm hồ sơ thử và đặt
# mật khẩu ngẫu nhiên cho người dùng mẫu (realm không chứa mật khẩu).
# Cần trên máy: docker compose v2.20+, curl, jq. Thoát mã 1 nếu có kiểm tra không đạt.
# Bước cuối dùng hết hạn mức /public (kiểm 429): chạy lại ngay thì bước đầu chờ tới khi /public mở lại.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "Thiếu .env — chạy: cp .env.example .env"; exit 1; }
set -a; . ./.env; set +a
export COMPOSE_PROFILES=core
: "${DXOS_APP:?Đặt DXOS_APP trong .env}"
# shellcheck source=scripts/lib-smoke.sh
. scripts/lib-smoke.sh

echo "== Lõi Tầng 1 (DXOS_APP=$DXOS_APP)"

# 1. Dịch vụ một lần đã thoát với mã 0, dịch vụ chạy nền healthy ------------------
for svc in bao-init db-secrets postgrest-secrets keycloak-secrets flowable-secrets garage-secrets \
           jwks-init db-init app-migrate app-realm garage-init; do
  for _ in $(seq 1 60); do  # chờ tối đa 2 phút nếu còn đang chạy
    tt="$(docker compose ps -a --format '{{.State}} {{.ExitCode}}' "$svc" 2>/dev/null)"
    case "$tt" in exited*) break ;; esac
    sleep 2
  done
  kiem "dịch vụ một lần $svc thoát mã 0" "exited 0" "${tt:-không có container}"
done
for svc in openbao postgres keycloak apisix flowable app-backend garage clamav; do
  for _ in $(seq 1 90); do  # vừa `make up` xong thì có thể còn "starting" (ClamAV nạp CSDL ~1–2 phút)
    st="$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q "$svc")" 2>/dev/null || echo khong-chay)"
    [ "$st" = "starting" ] || break
    sleep 2
  done
  kiem "$svc healthy" "healthy" "$st"
done

# Mật khẩu rest-admin cho các kiểm tra Flowable: đọc từ tệp OpenBao render trong container
# flowable (không còn trong .env, #10). Không in ra.
FLOWABLE_ADMIN_PASSWORD="$(docker compose exec -T flowable cat /run/dxos-secrets/flowable/flowable.rest.app.admin.password)"

# Chờ APISIX thấy PostgREST sẵn sàng (upstream /ready).
for _ in $(seq 1 20); do
  [ "$(ma_http "$GW/public/")" = "200" ] && break
  sleep 3
done
kiem "PostgREST sẵn sàng sau APISIX (/public/)" "200" "$(ma_http "$GW/public/")"

# 2. Gateway: /api, /workflow, /files bắt buộc JWT; API quản trị Flowable bị chặn ------
kiem "/api/ không token → 401" "401" "$(ma_http "$GW/api/")"
kiem "/api/ token rác → 401" "401" "$(ma_http -H 'Authorization: Bearer abc.def.ghi' "$GW/api/")"

for r in /workflow/tasks /files/x; do
  kiem "$r không token → 401" "401" "$(ma_http "$GW$r")"
  kiem "$r token rác → 401" "401" "$(ma_http -H 'Authorization: Bearer abc.def.ghi' "$GW$r")"
done
# API quản trị Flowable không mở qua gateway (kể cả khi không biết backend phía sau là gì).
for r in /workflow/repository/deployments /workflow/management/engine /workflow/identity/users \
         /workflow/runtime/tasks /workflow/query/tasks /flowable-rest/service/repository/deployments; do
  kiem "$r qua gateway → 403" "403" "$(ma_http -u "rest-admin:$FLOWABLE_ADMIN_PASSWORD" "$GW$r")"
done
kiem "Flowable không có cổng nào khác ngoài 127.0.0.1 (cổng debug)" "127.0.0.1" \
  "$(docker compose port flowable 8080 | cut -d: -f1)"
# cong_host <dịch vụ> → các cổng container được publish ra host (rỗng nếu không có)
cong_host() { docker inspect -f '{{range $p, $b := .HostConfig.PortBindings}}{{$p}} {{end}}' "$(docker compose ps -q "$1")"; }
kiem "app-backend, PostgREST, Garage, ClamAV, OpenBao không mở cổng ra host" "||||" \
  "$(cong_host app-backend)|$(cong_host postgrest)|$(cong_host garage)|$(cong_host clamav)|$(cong_host openbao)"

# 2b. CORS theo DXOS_CORS_ORIGINS ------------------------------------------------
ORIGIN="${DXOS_CORS_ORIGINS:-http://localhost:5173}"; ORIGIN="${ORIGIN%%,*}"
kiem "CORS: origin $ORIGIN được phép" "$ORIGIN" "$(header_http Access-Control-Allow-Origin -H "Origin: $ORIGIN" "$GW/public/")"
kiem "CORS: preflight /api từ $ORIGIN → 200" "200" \
  "$(ma_http -X OPTIONS -H "Origin: $ORIGIN" -H 'Access-Control-Request-Method: POST' "$GW/api/x")"
kiem "CORS: origin lạ không nhận header cho phép" "" \
  "$(header_http Access-Control-Allow-Origin -H 'Origin: http://evil.example' "$GW/public/")"

# 3. JWKS chỉ có một khóa ký RS256 ------------------------------------------------
jwks="$(curl -s "$KC/realms/dxos/protocol/openid-connect/certs")"
kiem "JWKS realm dxos: 1 khóa RS256/sig" "1 RS256 sig" \
  "$(jq -r '[(.keys|length), .keys[0].alg, .keys[0].use] | join(" ")' <<<"$jwks")"

# 4. Lõi không chứa bảng nghiệp vụ: schema dxos chỉ có sổ migration ------------------
kiem "schema dxos chỉ có bảng app_migration" "app_migration" \
  "$(sql "SELECT string_agg(tablename, ',') FROM pg_tables WHERE schemaname = 'dxos'")"
kiem "sổ migration có tệp của $DXOS_APP" "có" \
  "$(sql "SELECT CASE WHEN count(*) > 0 THEN 'có' ELSE 'không' END FROM dxos.app_migration WHERE ung_dung = '$DXOS_APP'")"

# 4b. Garage: một nút đã có layout, API quản trị đòi token ------------------------------
kiem "Garage: nút có vai trò trong layout (zone dxos)" "dxos" \
  "$(docker compose exec -T garage /garage status 2>/dev/null | awk '/HEALTHY NODES/ {f=1; next} f && $1 ~ /^[0-9a-f]+$/ {print $4; exit}' | tr -d '[]')"
kiem "Garage Admin API không token → 403" "403" \
  "$(docker compose exec -T app-backend python -c 'import urllib.request, urllib.error
try: print(urllib.request.urlopen("http://garage:3903/v2/ListKeys", timeout=5).status)
except urllib.error.HTTPError as e: print(e.code)')"

# 4c. OpenBao (#10): két đã unseal, policy theo danh tính, không bí mật trong cấu hình -----
. scripts/smoke-openbao.sh

# 5. Chạy lại migration và vai trò Keycloak: không lỗi, bỏ qua phần đã áp dụng ------
if out="$(docker compose run --rm --no-deps app-migrate 2>&1)"; then ma=0; else ma=$?; fi
kiem "app-migrate lần 2: mã thoát" "0" "$ma"
kiem "app-migrate lần 2: không áp dụng lại tệp nào" "0" "$(grep -c 'đã áp dụng ' <<<"$out" || true)"
if out="$(docker compose run --rm --no-deps app-realm 2>&1)"; then ma=0; else ma=$?; fi
kiem "app-realm lần 2: mã thoát" "0" "$ma"
kiem "app-realm lần 2: không thêm gì (added=0)" "added=0" "$(grep -oE 'added=[0-9]+' <<<"$out" || echo "$out" | tail -1)"
if out="$(docker compose run --rm --no-deps garage-init 2>&1)"; then ma=0; else ma=$?; fi
kiem "garage-init lần 2: mã thoát" "0" "$ma"
kiem "garage-init lần 2: không tạo thêm khóa, bucket, layout" "0" "$(grep -cE 'đã (tạo|áp dụng)' <<<"$out" || true)"

# 5b. Workflow engine: REST cần đăng nhập, CSDL riêng ------------------------------
kiem "Flowable REST không đăng nhập → 401" "401" "$(ma_http "$WF/repository/process-definitions")"
kiem "Flowable REST với rest-admin → 200" "200" "$(ma_http -u "rest-admin:$FLOWABLE_ADMIN_PASSWORD" "$WF/repository/process-definitions")"
kiem "Flowable dùng CSDL riêng flowable (có bảng act_re_procdef)" "1" \
  "$(docker compose exec -T postgres psql -XqtA -U "${POSTGRES_USER:-postgres}" -d flowable \
     -c "SELECT count(*) FROM pg_tables WHERE tablename = 'act_re_procdef'")"
kiem "CSDL $POSTGRES_DB không chứa bảng của Flowable" "0" \
  "$(sql "SELECT count(*) FROM pg_tables WHERE tablename LIKE 'act\\_%'")"
kiem "Flowable không nạp quy trình demo của image" "0" \
  "$(wf "repository/process-definitions?key=oneTaskProcess" | jq .total)"

# 6. Smoke riêng của ứng dụng ----------------------------------------------------
if [ -f "apps/$DXOS_APP/tests/smoke.sh" ]; then
  echo "== Ứng dụng $DXOS_APP"
  # shellcheck source=/dev/null
  . "apps/$DXOS_APP/tests/smoke.sh"
fi

# 7. Rate limit cổng công dân: dùng hết hạn mức /public của IP này → 429 -------------
# Chạy cuối cùng: sau bước này /public của máy chạy smoke bị khóa tới hết cửa sổ 60 giây.
echo "== Rate limit /public"
kiem "/public có header X-RateLimit-Limit = 60" "60" "$(header_http X-RateLimit-Limit "$GW/public/")"
con="$(header_http X-RateLimit-Remaining "$GW/public/")"
for _ in $(seq 1 "${con:-0}"); do curl -s -o /dev/null "$GW/public/"; done
kiem "vượt 60 request/phút trên /public → 429" "429" "$(ma_http "$GW/public/thu_tuc")"
kiem "/api không bị ảnh hưởng bởi hạn mức /public (không token → 401)" "401" "$(ma_http "$GW/api/ho_so")"

tong_ket
