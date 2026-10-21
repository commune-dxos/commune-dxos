# SPDX-License-Identifier: Apache-2.0
# Danh tính `garage-init`: dùng admin_token để cấu hình Garage, rồi ghi khóa S3 riêng của
# ứng dụng đang chọn (Garage sinh khóa, không ai đặt tay). Không đọc được nhánh core/db.
path "dxos/data/core/garage" {
  capabilities = ["read"]
}
path "dxos/data/apps/${DXOS_APP}/s3" {
  capabilities = ["create", "update", "read"]
}
