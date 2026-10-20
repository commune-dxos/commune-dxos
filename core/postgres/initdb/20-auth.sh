#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Đặt mật khẩu cho role đăng nhập và tạo CSDL riêng cho Keycloak.
# Mật khẩu lấy từ biến môi trường (.env), không ghi trong mã.
# Chạy sau 10-core.sql (docker-entrypoint-initdb.d chạy theo thứ tự tên tệp).
set -euo pipefail
: "${PGRST_DB_PASSWORD:?Thiếu PGRST_DB_PASSWORD}"
: "${KEYCLOAK_DB_PASSWORD:?Thiếu KEYCLOAK_DB_PASSWORD}"

psql -v ON_ERROR_STOP=1 \
  --username "${POSTGRES_USER:-postgres}" --dbname "${POSTGRES_DB:-postgres}" \
  -v pgrst_pw="$PGRST_DB_PASSWORD" -v kc_pw="$KEYCLOAK_DB_PASSWORD" <<'SQL'
ALTER ROLE authenticator WITH LOGIN PASSWORD :'pgrst_pw';
CREATE ROLE keycloak LOGIN PASSWORD :'kc_pw';
CREATE DATABASE keycloak OWNER keycloak;
SQL
