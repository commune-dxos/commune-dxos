#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# Dịch vụ một lần `flowable-db-init` của lõi: tạo role đăng nhập `flowable` và CSDL riêng
# `flowable` cho workflow engine (Flowable tự tạo bảng ACT_* khi khởi động). Chạy lại không
# lỗi; mật khẩu luôn được đặt lại theo .env. Kết nối qua PGHOST/PGUSER/PGPASSWORD/PGDATABASE.
set -eu
: "${FLOWABLE_DB_PASSWORD:?Thiếu FLOWABLE_DB_PASSWORD}"

psql -X -q -v ON_ERROR_STOP=1 -v pw="$FLOWABLE_DB_PASSWORD" <<'SQL'
SELECT 'CREATE ROLE flowable LOGIN' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flowable') \gexec
ALTER ROLE flowable WITH LOGIN PASSWORD :'pw';
SELECT 'CREATE DATABASE flowable OWNER flowable' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'flowable') \gexec
SQL
echo "flowable-db-init: role và CSDL flowable sẵn sàng"
