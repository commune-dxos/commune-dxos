# SPDX-License-Identifier: Apache-2.0
# Danh tính `rabbitmq-init` (#9): dùng tài khoản quản trị RabbitMQ để tạo vhost, user và
# topology của ứng dụng đang chọn, rồi ghi thông tin kết nối của user ứng dụng cho backend.
path "dxos/data/core/rabbitmq/admin" {
  capabilities = ["read"]
}
path "dxos/data/apps/${DXOS_APP}/rabbitmq" {
  capabilities = ["create", "update", "read"]
}
