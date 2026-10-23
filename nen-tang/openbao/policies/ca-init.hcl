# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Danh tính `ca-init` (#77): xin step-ca chứng thư ký tài liệu cho dịch vụ Tầng 2 bằng mật khẩu
# provisioner, rồi ghi khóa + chứng thư vào nhánh của dịch vụ Tầng 2 cho backend đọc. Không đọc
# được mật khẩu khóa CA (core/step-ca/ca), không đọc bí mật khác của Tầng 2.
path "dxos/data/core/step-ca/provisioner" {
  capabilities = ["read"]
}
path "dxos/data/tang2/${DXOS_TANG2}/ky-so" {
  capabilities = ["create", "update", "read"]
}
