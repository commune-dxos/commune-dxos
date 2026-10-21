#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# Test SQL/RLS của mọi ứng dụng trên PostgreSQL trống (#11), không cần cả stack `core`.
# Mỗi ứng dụng apps/<tên>/ có db/ được thử trên một CSDL riêng, đúng thứ tự như khi `make up`:
#   1. core/postgres/initdb/10-core.sql (lõi: role authenticator/anon, schema dxos);
#   2. core/scripts/app-migrate.sh (migration của ứng dụng), chạy HAI lần: lần sau phải bỏ qua hết;
#   3. apps/<tên>/db/tests/*.sql khi chưa có dữ liệu mẫu;
#   4. nạp seed (DXOS_SEED=true) rồi chạy lại db/tests/*.sql.
# Tệp test in mỗi dòng ĐẠT|… hoặc TRƯỢT|…; có dòng TRƯỢT hay psql lỗi → thoát mã 1.
#
# Hai cách chạy:
#   - Đã có PGHOST (CI: service container postgres): chạy thẳng bằng psql trên máy.
#   - Không có PGHOST (`make test-sql` trên máy): tự dựng container tạm từ đúng image
#     postgres trong docker-compose.yml, chạy script này bên trong container rồi xóa container.
set -eu
cd "$(dirname "$0")/.."

if [ -z "${PGHOST:-}" ]; then
  command -v docker > /dev/null 2>&1 || { echo "test-sql: cần Docker (hoặc đặt PGHOST tới một PostgreSQL trống)" >&2; exit 1; }
  IMAGE="$(sed -n 's/^ *image: *\(postgres:[^ ]*\).*/\1/p' docker-compose.yml | head -n 1)"
  [ -n "$IMAGE" ] || { echo "test-sql: không tìm thấy image postgres trong docker-compose.yml" >&2; exit 1; }
  TEN="dxos-test-sql-$$"
  trap 'docker rm -f "$TEN" > /dev/null 2>&1 || true' EXIT INT TERM
  echo "test-sql: dựng container tạm $TEN ($IMAGE)"
  docker run -d --name "$TEN" -e POSTGRES_PASSWORD=test-sql \
    -v "$PWD:/src:ro" --tmpfs /var/lib/postgresql/data "$IMAGE" > /dev/null
  docker exec -e PGHOST=localhost -e PGUSER=postgres -e PGPASSWORD=test-sql -w /src \
    "$TEN" sh scripts/test-sql.sh
  exit $?
fi

export PGUSER="${PGUSER:-postgres}"
psql_q() { psql -X -v ON_ERROR_STOP=1 -qtA "$@"; }

# Chờ PostgreSQL sẵn sàng (container vừa khởi động còn chạy initdb).
i=0
until psql_q -d postgres -c 'SELECT 1' > /dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -le 60 ] || { echo "test-sql: PostgreSQL ở $PGHOST không sẵn sàng sau 60 giây" >&2; exit 1; }
  sleep 1
done
psql_q -d postgres -c 'SELECT version()'

TONG_DAT=0
TONG_TRUOT=0
LOG="$(mktemp)"
trap 'rm -f "$LOG"' EXIT

chay_test() { # $1 = CSDL, $2 = nhãn giai đoạn
  for tep in $(find "$APP_DIR/db/tests" -maxdepth 1 -type f -name '*.sql' | sort); do
    if psql -X -qtA -v ON_ERROR_STOP=1 -d "$1" -f "$tep" > "$LOG" 2>&1; then ma=0; else ma=$?; fi
    dat="$(grep -c '^ĐẠT|' "$LOG" || true)"
    truot="$(grep -c '^TRƯỢT|' "$LOG" || true)"
    TONG_DAT=$((TONG_DAT + dat))
    TONG_TRUOT=$((TONG_TRUOT + truot))
    echo "  $tep ($2): $dat đạt, $truot trượt, psql thoát mã $ma"
    if [ "$ma" -ne 0 ] || [ "$truot" -ne 0 ]; then
      grep -v '^ĐẠT|' "$LOG" | sed 's/^/    /'
      [ "$truot" -ne 0 ] || TONG_TRUOT=$((TONG_TRUOT + 1))
    fi
  done
}

so_app=0
for APP_DIR in apps/*; do
  [ -d "$APP_DIR/db" ] || continue
  app="$(basename "$APP_DIR")"
  so_app=$((so_app + 1))
  db="test_$(printf '%s' "$app" | tr -c 'a-zA-Z0-9\n' '_')"
  echo "== $app (CSDL $db)"
  psql_q -d postgres -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db"
  psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f core/postgres/initdb/10-core.sql
  for lan in 1 2; do
    echo "-- app-migrate lần $lan"
    if ! PGDATABASE="$db" DXOS_APP="$app" APP_DIR="$APP_DIR" DXOS_SEED=false \
        sh core/scripts/app-migrate.sh > "$LOG" 2>&1; then
      cat "$LOG"; echo "test-sql: app-migrate lỗi" >&2; exit 1
    fi
    cat "$LOG"
    if [ "$lan" = 2 ] && grep -q '^app-migrate: đã áp dụng' "$LOG"; then
      echo "test-sql: app-migrate lần 2 còn áp dụng lại tệp, migration không idempotent" >&2; exit 1
    fi
  done
  if [ -d "$APP_DIR/db/tests" ]; then
    chay_test "$db" "không dữ liệu mẫu"
    echo "-- nạp dữ liệu mẫu"
    PGDATABASE="$db" DXOS_APP="$app" APP_DIR="$APP_DIR" DXOS_SEED=true sh core/scripts/app-migrate.sh
    chay_test "$db" "có dữ liệu mẫu"
  else
    echo "  ($app không có db/tests/, chỉ kiểm migration)"
  fi
done

[ "$so_app" -gt 0 ] || { echo "test-sql: không có ứng dụng nào có db/" >&2; exit 1; }
echo "test-sql: $so_app ứng dụng, $TONG_DAT kiểm tra đạt, $TONG_TRUOT trượt/lỗi"
[ "$TONG_TRUOT" -eq 0 ]
