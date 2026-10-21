# SPDX-License-Identifier: Apache-2.0
# Danh tính `app-realm`: đăng nhập quản trị Keycloak để nạp realm của ứng dụng, rồi ghi
# client secret của client dịch vụ vào nhánh của ứng dụng đang chọn. Không đọc lại được
# secret đã ghi (chỉ create/update), không chạm nhánh core/db.
path "dxos/data/core/keycloak/admin" {
  capabilities = ["read"]
}
path "dxos/data/apps/${DXOS_APP}/keycloak/*" {
  capabilities = ["create", "update"]
}
