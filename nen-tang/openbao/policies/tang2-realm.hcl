# SPDX-License-Identifier: Apache-2.0
# Danh tính `tang2-realm`: đăng nhập quản trị Keycloak để nạp realm của Tầng 2, rồi ghi
# client secret của client dịch vụ vào nhánh của dịch vụ Tầng 2. Không đọc lại được
# secret đã ghi (chỉ create/update), không chạm nhánh core/db.
path "dxos/data/core/keycloak/admin" {
  capabilities = ["read"]
}
path "dxos/data/tang2/${DXOS_TANG2}/keycloak/*" {
  capabilities = ["create", "update"]
}
