# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Danh tính `flowable`: mật khẩu role CSDL flowable + tài khoản REST rest-admin.
path "dxos/data/core/db/flowable" {
  capabilities = ["read"]
}
path "dxos/data/core/flowable/rest-admin" {
  capabilities = ["read"]
}
