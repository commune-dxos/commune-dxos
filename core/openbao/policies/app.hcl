# SPDX-License-Identifier: Apache-2.0
# Danh tính `app`: backend riêng của ứng dụng đang chọn (dịch vụ app-backend). Đọc bí mật
# của chính ứng dụng (khóa S3, client secret Keycloak) và tài khoản kỹ thuật Flowable
# rest-admin (API quy trình mỏng). Không đọc mật khẩu CSDL hay quản trị Keycloak, không ghi.
path "dxos/data/apps/${DXOS_APP}/*" {
  capabilities = ["read"]
}
path "dxos/data/core/flowable/rest-admin" {
  capabilities = ["read"]
}
