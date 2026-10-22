# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Danh tính `keycloak`: mật khẩu role CSDL keycloak + tài khoản quản trị khởi tạo.
path "dxos/data/core/db/keycloak" {
  capabilities = ["read"]
}
path "dxos/data/core/keycloak/admin" {
  capabilities = ["read"]
}
