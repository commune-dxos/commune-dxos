#!/bin/sh
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Test SQL/RLS của bộ máy một cửa trên PostgreSQL trống (#11), không cần cả stack `core`.
# mot-cua/db/ được thử trên một CSDL riêng, đúng thứ tự như khi `make up`:
#   1. nen-tang/postgres/initdb/10-core.sql (nền tảng: role authenticator/anon, schema dxos);
#   2. nen-tang/scripts/tang2-migrate.sh (migration của mot-cua), chạy HAI lần: lần sau phải bỏ qua hết;
#   3. mot-cua/db/tests/*.sql khi chưa có dữ liệu mẫu;
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
  for tep in $(find "$TANG2_DIR/db/tests" -maxdepth 1 -type f -name '*.sql' | sort); do
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

TANG2_DIR=mot-cua
tang2=mot-cua
db=test_mot_cua
echo "== $tang2 (CSDL $db)"
psql_q -d postgres -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db"
psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f nen-tang/postgres/initdb/10-core.sql
for lan in 1 2; do
  echo "-- tang2-migrate lần $lan"
  if ! PGDATABASE="$db" DXOS_TANG2="$tang2" TANG2_DIR="$TANG2_DIR" DXOS_SEED=false \
      sh nen-tang/scripts/tang2-migrate.sh > "$LOG" 2>&1; then
    cat "$LOG"; echo "test-sql: tang2-migrate lỗi" >&2; exit 1
  fi
  cat "$LOG"
  if [ "$lan" = 2 ] && grep -q '^tang2-migrate: đã áp dụng' "$LOG"; then
    echo "test-sql: tang2-migrate lần 2 còn áp dụng lại tệp, migration không idempotent" >&2; exit 1
  fi
done
# CSDL cài từ v0.2.0 trở về trước ghi SHA-256 của tệp có header Apache-2.0 (D-010, #47): đặt lại sổ
# như vậy rồi chạy migrate lần 3, phải chỉ cập nhật sổ chứ không áp dụng lại hay báo tệp bị sửa.
echo "-- tang2-migrate lần 3 (sổ ghi SHA-256 trước D-010)"
for tep in "$TANG2_DIR"/db/migrations/*.sql; do
  cu="$({ echo "-- SPDX-License-Identifier: Apache-2.0"; tail -n +3 "$tep"; } | sha256sum | cut -d' ' -f1)"
  psql_q -d "$db" -v tep="$(basename "$tep")" -v sha="$cu" > /dev/null <<'SQL'
UPDATE dxos.app_migration SET sha256 = :'sha' WHERE loai = 'migration' AND tep = :'tep';
SQL
done
if ! PGDATABASE="$db" DXOS_TANG2="$tang2" TANG2_DIR="$TANG2_DIR" DXOS_SEED=false \
    sh nen-tang/scripts/tang2-migrate.sh > "$LOG" 2>&1; then
  cat "$LOG"; echo "test-sql: tang2-migrate không nhận sổ ghi trước D-010" >&2; exit 1
fi
cat "$LOG"
if grep -q '^tang2-migrate: đã áp dụng' "$LOG" || ! grep -q 'chỉ đổi header giấy phép' "$LOG"; then
  echo "test-sql: tang2-migrate lần 3 phải chỉ cập nhật sổ" >&2; exit 1
fi
chay_test "$db" "không dữ liệu mẫu"
echo "-- nạp dữ liệu mẫu"
PGDATABASE="$db" DXOS_TANG2="$tang2" TANG2_DIR="$TANG2_DIR" DXOS_SEED=true sh nen-tang/scripts/tang2-migrate.sh
chay_test "$db" "có dữ liệu mẫu"

echo "test-sql: $TONG_DAT kiểm tra đạt, $TONG_TRUOT trượt/lỗi"
[ "$TONG_TRUOT" -eq 0 ]
