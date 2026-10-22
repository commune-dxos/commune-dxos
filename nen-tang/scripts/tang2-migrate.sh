#!/bin/sh
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Dịch vụ một lần `tang2-migrate` của lõi: áp dụng SQL của dịch vụ Tầng 2.
# Lõi chỉ biết quy ước thư mục, không biết nội dung nghiệp vụ:
#   /tang2 = mot-cua/ (mount chỉ đọc)
#   /tang2/db/migrations/*.sql  áp dụng một lần, theo thứ tự tên tệp
#   /tang2/db/seed/*.sql        dữ liệu giả, chỉ khi DXOS_SEED=true, cũng một lần
# Mỗi tệp chạy trong một transaction cùng dòng ghi sổ dxos.app_migration, nên lỗi
# giữa chừng không để lại nửa schema. Tệp đã áp dụng mà bị sửa → dừng với mã lỗi.
# Ngoại lệ duy nhất (D-010, #47): tệp áp dụng từ v0.2.0 trở về trước chỉ khác header giấy phép
# (`-- SPDX-License-Identifier: Apache-2.0` thành 2 dòng GPL-3.0-or-later) thì cập nhật sổ, không chạy lại.
# Kết nối qua biến chuẩn của libpq: PGHOST, PGUSER, PGPASSWORD, PGDATABASE.
set -eu
: "${DXOS_TANG2:?Thiếu DXOS_TANG2}"
DXOS_SEED="${DXOS_SEED:-false}"
TANG2_DIR="${TANG2_DIR:-/tang2}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

psql_q() { psql -X -v ON_ERROR_STOP=1 -qtA "$@"; }

# SHA-256 của tệp như trước D-010: header GPL 2 dòng đổi lại thành 1 dòng Apache-2.0.
# Tệp không có đúng header GPL ở 2 dòng đầu thì không in gì.
sha_truoc_d010() {
  [ "$(head -n 2 "$1")" = "-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later" ] || return 0
  { echo "-- SPDX-License-Identifier: Apache-2.0"; tail -n +3 "$1"; } | sha256sum | cut -d' ' -f1
}

[ -d "$TANG2_DIR/db" ] || { echo "tang2-migrate: $DXOS_TANG2 không có thư mục db/, bỏ qua"; exit 0; }

# Lõi phải được khởi tạo trước (nen-tang/postgres/initdb/10-core.sql).
if [ "$(psql_q -c "SELECT to_regclass('dxos.app_migration') IS NOT NULL")" != "t" ]; then
  echo "tang2-migrate: thiếu dxos.app_migration. Volume PostgreSQL được tạo trước khi tách nen-tang/apps?" >&2
  echo "  Xóa volume rồi chạy lại: docker compose --profile core down -v && make up" >&2
  exit 1
fi

ap_dung() { # $1 = migration|seed, $2 = thư mục
  loai="$1"; thu_muc="$2"
  [ -d "$thu_muc" ] || return 0
  for tep in $(find "$thu_muc" -maxdepth 1 -type f -name '*.sql' | sort); do
    ten="$(basename "$tep")"
    sha="$(sha256sum "$tep" | cut -d' ' -f1)"
    da_co="$(psql_q -v app="$DXOS_TANG2" -v loai="$loai" -v tep="$ten" <<'SQL'
SELECT sha256 FROM dxos.app_migration WHERE ung_dung = :'app' AND loai = :'loai' AND tep = :'tep';
SQL
)"
    if [ -n "$da_co" ]; then
      if [ "$da_co" != "$sha" ] && [ "$da_co" = "$(sha_truoc_d010 "$tep")" ]; then
        cat > "$TMP/doi-so.sql" <<'SQL'
UPDATE dxos.app_migration SET sha256 = :'sha' WHERE ung_dung = :'app' AND loai = :'loai' AND tep = :'tep';
SQL
        psql_q -v app="$DXOS_TANG2" -v loai="$loai" -v tep="$ten" -v sha="$sha" -f "$TMP/doi-so.sql"
        echo "tang2-migrate: $loai $ten chỉ đổi header giấy phép (D-010), cập nhật sổ, không chạy lại"
        continue
      fi
      if [ "$da_co" != "$sha" ]; then
        echo "tang2-migrate: $loai $ten đã áp dụng nhưng nội dung bị sửa. Viết tệp migration mới thay vì sửa tệp cũ." >&2
        exit 1
      fi
      echo "tang2-migrate: bỏ qua $loai $ten (đã áp dụng)"
      continue
    fi
    cat > "$TMP/ghi-so.sql" <<'SQL'
INSERT INTO dxos.app_migration (ung_dung, loai, tep, sha256) VALUES (:'app', :'loai', :'tep', :'sha');
SQL
    psql -X -q -v ON_ERROR_STOP=1 --single-transaction \
      -v app="$DXOS_TANG2" -v loai="$loai" -v tep="$ten" -v sha="$sha" \
      -f "$tep" -f "$TMP/ghi-so.sql"
    echo "tang2-migrate: đã áp dụng $loai $ten"
  done
}

ap_dung migration "$TANG2_DIR/db/migrations"
if [ "$DXOS_SEED" = "true" ]; then
  ap_dung seed "$TANG2_DIR/db/seed"
else
  echo "tang2-migrate: DXOS_SEED=$DXOS_SEED, không nạp dữ liệu mẫu"
fi

# PostgREST nạp lại schema cache (kênh NOTIFY mặc định `pgrst`).
psql_q -c "NOTIFY pgrst, 'reload schema'" > /dev/null
echo "tang2-migrate: xong ($DXOS_TANG2)"
