#!/bin/sh
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Dịch vụ một lần `db-init` của lõi (thay flowable-db-init, #10): đảm bảo role đăng nhập
# và CSDL riêng của các dịch vụ lõi, đặt mật khẩu theo OpenBao rồi thoát. Chạy mỗi lần `up`
# nên đổi mật khẩu trong OpenBao rồi `make up` là PostgreSQL cập nhật theo (xoay vòng bí mật).
#   authenticator  PostgREST (role tạo trong initdb/10-core.sql)
#   keycloak       CSDL riêng keycloak
#   flowable       CSDL riêng flowable (Flowable tự tạo bảng ACT_* khi khởi động)
#   superset       CSDL riêng superset (metadata của Superset, #82)
#   bao_cao_doc    role đăng nhập chỉ đọc báo cáo cho Superset (#82). Lõi chỉ cho đăng nhập; được đọc bảng
#                  nào do dịch vụ Tầng 2 GRANT trong migration của nó (mot-cua: schema bao_cao)
#   dxos_kiem_toan role NOLOGIN của pgAudit (log đối tượng: Tầng 2 GRANT bảng cần theo dõi, #75)
# và extension pgaudit trong CSDL chính khi PostgreSQL đã nạp pgAudit (docker-compose.yml).
# Mật khẩu đọc từ tệp do agent `db-secrets` render vào volume db-secrets (DB_SECRETS_DIR);
# superuser đăng nhập bằng PGPASSFILE cùng volume. Mật khẩu không nằm trong tham số lệnh
# (psql tự đọc tệp bằng \set … `cat …`), không in ra log.
set -eu
export D="${DB_SECRETS_DIR:-/run/dxos-secrets}"
for f in authenticator_password keycloak_password flowable_password superset_password bao_cao_doc_password; do
  [ -s "$D/$f" ] || { echo "db-init: thiếu $D/$f (agent db-secrets chưa render?)" >&2; exit 1; }
done

psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
\set pw_authenticator `cat "$D/authenticator_password"`
\set pw_keycloak `cat "$D/keycloak_password"`
\set pw_flowable `cat "$D/flowable_password"`
\set pw_superset `cat "$D/superset_password"`
\set pw_bao_cao_doc `cat "$D/bao_cao_doc_password"`
ALTER ROLE authenticator WITH LOGIN PASSWORD :'pw_authenticator';
SELECT 'CREATE ROLE keycloak LOGIN' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'keycloak') \gexec
ALTER ROLE keycloak WITH LOGIN PASSWORD :'pw_keycloak';
SELECT 'CREATE DATABASE keycloak OWNER keycloak' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'keycloak') \gexec
SELECT 'CREATE ROLE flowable LOGIN' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flowable') \gexec
ALTER ROLE flowable WITH LOGIN PASSWORD :'pw_flowable';
SELECT 'CREATE DATABASE flowable OWNER flowable' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'flowable') \gexec
SELECT 'CREATE ROLE superset LOGIN' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'superset') \gexec
ALTER ROLE superset WITH LOGIN PASSWORD :'pw_superset';
SELECT 'CREATE DATABASE superset OWNER superset' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'superset') \gexec
SELECT 'CREATE ROLE bao_cao_doc LOGIN' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bao_cao_doc') \gexec
ALTER ROLE bao_cao_doc WITH LOGIN NOINHERIT CONNECTION LIMIT 10 PASSWORD :'pw_bao_cao_doc';
SELECT 'CREATE ROLE dxos_kiem_toan NOLOGIN' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dxos_kiem_toan') \gexec
SELECT 'CREATE EXTENSION IF NOT EXISTS pgaudit'
 WHERE current_setting('shared_preload_libraries') ~ '(^|[ ,])pgaudit($|[ ,])' \gexec
SQL
echo "db-init: role authenticator, keycloak, flowable, superset, bao_cao_doc, dxos_kiem_toan, CSDL keycloak, flowable, superset, pgAudit sẵn sàng (mật khẩu theo OpenBao)"
