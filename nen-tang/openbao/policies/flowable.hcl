# SPDX-License-Identifier: Apache-2.0
# Danh tính `flowable`: mật khẩu role CSDL flowable + tài khoản REST rest-admin.
path "dxos/data/core/db/flowable" {
  capabilities = ["read"]
}
path "dxos/data/core/flowable/rest-admin" {
  capabilities = ["read"]
}
