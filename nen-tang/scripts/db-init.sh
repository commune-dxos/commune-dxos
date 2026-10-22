#!/bin/sh
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Dịch vụ một lần `db-init` của lõi (thay flowable-db-init, #10): đảm bảo role đăng nhập
# và CSDL riêng của các dịch vụ lõi, đặt mật khẩu theo OpenBao rồi thoát. Chạy mỗi lần `up`
# nên đổi mật khẩu trong OpenBao rồi `make up` là PostgreSQL cập nhật theo (xoay vòng bí mật).
#   authenticator  PostgREST (role tạo trong initdb/10-core.sql)
#   keycloak       CSDL riêng keycloak
#   flowable       CSDL riêng flowable (Flowable tự tạo bảng ACT_* khi khởi động)
# Mật khẩu đọc từ tệp do agent `db-secrets` render vào volume db-secrets (DB_SECRETS_DIR);
# superuser đăng nhập bằng PGPASSFILE cùng volume. Mật khẩu không nằm trong tham số lệnh
# (psql tự đọc tệp bằng \set … `cat …`), không in ra log.
set -eu
export D="${DB_SECRETS_DIR:-/run/dxos-secrets}"
for f in authenticator_password keycloak_password flowable_password; do
  [ -s "$D/$f" ] || { echo "db-init: thiếu $D/$f (agent db-secrets chưa render?)" >&2; exit 1; }
done

psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
\set pw_authenticator `cat "$D/authenticator_password"`
\set pw_keycloak `cat "$D/keycloak_password"`
\set pw_flowable `cat "$D/flowable_password"`
ALTER ROLE authenticator WITH LOGIN PASSWORD :'pw_authenticator';
SELECT 'CREATE ROLE keycloak LOGIN' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'keycloak') \gexec
ALTER ROLE keycloak WITH LOGIN PASSWORD :'pw_keycloak';
SELECT 'CREATE DATABASE keycloak OWNER keycloak' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'keycloak') \gexec
SELECT 'CREATE ROLE flowable LOGIN' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flowable') \gexec
ALTER ROLE flowable WITH LOGIN PASSWORD :'pw_flowable';
SELECT 'CREATE DATABASE flowable OWNER flowable' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'flowable') \gexec
SQL
echo "db-init: role authenticator, keycloak, flowable và CSDL keycloak, flowable sẵn sàng (mật khẩu theo OpenBao)"
