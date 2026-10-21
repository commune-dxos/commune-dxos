#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# make smoke: kiểm tra lõi Tầng 1 đang chạy (sau `make up`) rồi gọi smoke của ứng dụng
# apps/<DXOS_APP>/tests/smoke.sh nếu có. Không xóa dữ liệu; chỉ thêm hồ sơ thử và đặt
# mật khẩu ngẫu nhiên cho người dùng mẫu (realm không chứa mật khẩu).
# Cần trên máy: docker compose v2.20+, curl, jq. Thoát mã 1 nếu có kiểm tra không đạt.
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
for svc in jwks-init app-migrate app-realm flowable-db-init; do
  for _ in $(seq 1 60); do  # chờ tối đa 2 phút nếu còn đang chạy
    tt="$(docker compose ps -a --format '{{.State}} {{.ExitCode}}' "$svc" 2>/dev/null)"
    case "$tt" in exited*) break ;; esac
    sleep 2
  done
  kiem "dịch vụ một lần $svc thoát mã 0" "exited 0" "${tt:-không có container}"
done
for svc in postgres keycloak apisix flowable; do
  kiem "$svc healthy" "healthy" "$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q "$svc")" 2>/dev/null || echo khong-chay)"
done

# Chờ APISIX thấy PostgREST sẵn sàng (upstream /ready).
for _ in $(seq 1 20); do
  [ "$(ma_http "$GW/public/")" = "200" ] && break
  sleep 3
done
kiem "PostgREST sẵn sàng sau APISIX (/public/)" "200" "$(ma_http "$GW/public/")"

# 2. Gateway: /api/* bắt buộc JWT -----------------------------------------------
kiem "/api/ không token → 401" "401" "$(ma_http "$GW/api/")"
kiem "/api/ token rác → 401" "401" "$(ma_http -H 'Authorization: Bearer abc.def.ghi' "$GW/api/")"

# 3. JWKS chỉ có một khóa ký RS256 ------------------------------------------------
jwks="$(curl -s "$KC/realms/dxos/protocol/openid-connect/certs")"
kiem "JWKS realm dxos: 1 khóa RS256/sig" "1 RS256 sig" \
  "$(jq -r '[(.keys|length), .keys[0].alg, .keys[0].use] | join(" ")' <<<"$jwks")"

# 4. Lõi không chứa bảng nghiệp vụ: schema dxos chỉ có sổ migration ------------------
kiem "schema dxos chỉ có bảng app_migration" "app_migration" \
  "$(sql "SELECT string_agg(tablename, ',') FROM pg_tables WHERE schemaname = 'dxos'")"
kiem "sổ migration có tệp của $DXOS_APP" "có" \
  "$(sql "SELECT CASE WHEN count(*) > 0 THEN 'có' ELSE 'không' END FROM dxos.app_migration WHERE ung_dung = '$DXOS_APP'")"

# 5. Chạy lại migration và vai trò Keycloak: không lỗi, bỏ qua phần đã áp dụng ------
if out="$(docker compose run --rm --no-deps app-migrate 2>&1)"; then ma=0; else ma=$?; fi
kiem "app-migrate lần 2: mã thoát" "0" "$ma"
kiem "app-migrate lần 2: không áp dụng lại tệp nào" "0" "$(grep -c 'đã áp dụng ' <<<"$out" || true)"
if out="$(docker compose run --rm --no-deps app-realm 2>&1)"; then ma=0; else ma=$?; fi
kiem "app-realm lần 2: mã thoát" "0" "$ma"
kiem "app-realm lần 2: không thêm gì (added=0)" "added=0" "$(grep -oE 'added=[0-9]+' <<<"$out" || echo "$out" | tail -1)"

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

tong_ket
