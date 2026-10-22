# SPDX-License-Identifier: Apache-2.0
# Danh tính `keycloak`: mật khẩu role CSDL keycloak + tài khoản quản trị khởi tạo.
path "dxos/data/core/db/keycloak" {
  capabilities = ["read"]
}
path "dxos/data/core/keycloak/admin" {
  capabilities = ["read"]
}
