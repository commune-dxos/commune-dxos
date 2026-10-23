#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Dịch vụ một lần `superset-init` của lõi (#82): đưa CSDL metadata `superset` lên lược đồ của phiên bản
# đang chạy, tạo vai trò và quyền mặc định, rồi chạy phần dựng báo cáo mà dịch vụ Tầng 2 khai báo ở
# /tang2/bao-cao/superset_dung.py (kết nối, dataset, chart, dashboard; lõi không biết nội dung). Chạy ở
# mỗi `make up-bi`, idempotent. Không tạo tài khoản mật khẩu nào: đăng nhập chỉ bằng SSO Keycloak.
set -euo pipefail
superset db upgrade
superset init
if [ -f /tang2/bao-cao/superset_dung.py ]; then
  python /tang2/bao-cao/superset_dung.py
else
  echo "superset-init: dịch vụ Tầng 2 không khai báo báo cáo (/tang2/bao-cao/superset_dung.py), bỏ qua"
fi
echo "superset-init: xong"
