# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Danh tính `tang2`: backend riêng của dịch vụ Tầng 2 (dịch vụ mot-cua-api). Đọc bí mật
# của chính dịch vụ Tầng 2 (khóa S3, client secret Keycloak) và tài khoản kỹ thuật Flowable
# rest-admin (API quy trình mỏng). Không đọc mật khẩu CSDL hay quản trị Keycloak, không ghi.
path "dxos/data/tang2/${DXOS_TANG2}/*" {
  capabilities = ["read"]
}
path "dxos/data/core/flowable/rest-admin" {
  capabilities = ["read"]
}
