#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# Dịch vụ một lần `app-migrate` của lõi: áp dụng SQL của ứng dụng đang chọn.
# Lõi chỉ biết quy ước thư mục, không biết nội dung nghiệp vụ:
#   /app = apps/<DXOS_APP>/ (mount chỉ đọc)
#   /app/db/migrations/*.sql  áp dụng một lần, theo thứ tự tên tệp
#   /app/db/seed/*.sql        dữ liệu giả, chỉ khi DXOS_SEED=true, cũng một lần
# Mỗi tệp chạy trong một transaction cùng dòng ghi sổ dxos.app_migration, nên lỗi
# giữa chừng không để lại nửa schema. Tệp đã áp dụng mà bị sửa → dừng với mã lỗi.
# Kết nối qua biến chuẩn của libpq: PGHOST, PGUSER, PGPASSWORD, PGDATABASE.
set -eu
: "${DXOS_APP:?Thiếu DXOS_APP}"
DXOS_SEED="${DXOS_SEED:-false}"
APP_DIR="${APP_DIR:-/app}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

psql_q() { psql -X -v ON_ERROR_STOP=1 -qtA "$@"; }

[ -d "$APP_DIR/db" ] || { echo "app-migrate: $DXOS_APP không có thư mục db/, bỏ qua"; exit 0; }

# Lõi phải được khởi tạo trước (core/postgres/initdb/10-core.sql).
if [ "$(psql_q -c "SELECT to_regclass('dxos.app_migration') IS NOT NULL")" != "t" ]; then
  echo "app-migrate: thiếu dxos.app_migration. Volume PostgreSQL được tạo trước khi tách core/apps?" >&2
  echo "  Xóa volume rồi chạy lại: docker compose --profile core down -v && make up" >&2
  exit 1
fi

ap_dung() { # $1 = migration|seed, $2 = thư mục
  loai="$1"; thu_muc="$2"
  [ -d "$thu_muc" ] || return 0
  for tep in $(find "$thu_muc" -maxdepth 1 -type f -name '*.sql' | sort); do
    ten="$(basename "$tep")"
    sha="$(sha256sum "$tep" | cut -d' ' -f1)"
    da_co="$(psql_q -v app="$DXOS_APP" -v loai="$loai" -v tep="$ten" <<'SQL'
SELECT sha256 FROM dxos.app_migration WHERE ung_dung = :'app' AND loai = :'loai' AND tep = :'tep';
SQL
)"
    if [ -n "$da_co" ]; then
      if [ "$da_co" != "$sha" ]; then
        echo "app-migrate: $loai $ten đã áp dụng nhưng nội dung bị sửa. Viết tệp migration mới thay vì sửa tệp cũ." >&2
        exit 1
      fi
      echo "app-migrate: bỏ qua $loai $ten (đã áp dụng)"
      continue
    fi
    cat > "$TMP/ghi-so.sql" <<'SQL'
INSERT INTO dxos.app_migration (ung_dung, loai, tep, sha256) VALUES (:'app', :'loai', :'tep', :'sha');
SQL
    psql -X -q -v ON_ERROR_STOP=1 --single-transaction \
      -v app="$DXOS_APP" -v loai="$loai" -v tep="$ten" -v sha="$sha" \
      -f "$tep" -f "$TMP/ghi-so.sql"
    echo "app-migrate: đã áp dụng $loai $ten"
  done
}

ap_dung migration "$APP_DIR/db/migrations"
if [ "$DXOS_SEED" = "true" ]; then
  ap_dung seed "$APP_DIR/db/seed"
else
  echo "app-migrate: DXOS_SEED=$DXOS_SEED, không nạp dữ liệu mẫu"
fi

# PostgREST nạp lại schema cache (kênh NOTIFY mặc định `pgrst`).
psql_q -c "NOTIFY pgrst, 'reload schema'" > /dev/null
echo "app-migrate: xong ($DXOS_APP)"
