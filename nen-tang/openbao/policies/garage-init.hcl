# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Danh tính `garage-init`: dùng admin_token để cấu hình Garage, rồi ghi khóa S3 riêng của
# dịch vụ Tầng 2 (Garage sinh khóa, không ai đặt tay). Không đọc được nhánh core/db.
path "dxos/data/core/garage" {
  capabilities = ["read"]
}
path "dxos/data/tang2/${DXOS_TANG2}/s3" {
  capabilities = ["create", "update", "read"]
}
