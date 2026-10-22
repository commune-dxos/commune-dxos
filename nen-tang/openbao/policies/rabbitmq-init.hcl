# SPDX-License-Identifier: Apache-2.0
# Danh tính `rabbitmq-init` (#9): dùng tài khoản quản trị RabbitMQ để tạo vhost, user và
# topology của dịch vụ Tầng 2, rồi ghi thông tin kết nối của user Tầng 2 cho backend.
path "dxos/data/core/rabbitmq/admin" {
  capabilities = ["read"]
}
path "dxos/data/tang2/${DXOS_TANG2}/rabbitmq" {
  capabilities = ["create", "update", "read"]
}
