# SPDX-License-Identifier: Apache-2.0
# bao agent một lần cho danh tính `rabbitmq` (dịch vụ rabbitmq-secrets trong
# docker-compose.yml, #9): đăng nhập AppRole bằng role_id/secret_id do bao-init đặt trong
# volume rabbitmq-secrets, render tệp cấu hình chứa tài khoản quản trị khởi tạo (quyền 0400)
# vào thư mục conf.d trong chính volume đó rồi thoát. Chạy bằng uid 100 (rabbitmq của image
# alpine). RabbitMQ chỉ dùng default_user/default_pass khi CSDL của nút còn trống (lần chạy
# đầu), giống POSTGRES_PASSWORD. Policy: nen-tang/openbao/policies/rabbitmq.hcl.

vault {
  address = "http://openbao:8200"
  retry {
    num_retries = 2
  }
}

auto_auth {
  method "approle" {
    exit_on_err = true
    config = {
      role_id_file_path                   = "/run/dxos-secrets/approle/role_id"
      secret_id_file_path                 = "/run/dxos-secrets/approle/secret_id"
      remove_secret_id_file_after_reading = false
    }
  }
}

exit_after_auth = true

template_config {
  exit_on_retry_failure = true
}

template {
  destination          = "/run/dxos-secrets/conf.d/20-admin.conf"
  perms                = "0400"
  error_on_missing_key = true
  contents             = <<-EOT
  # Sinh bởi bao agent (nen-tang/openbao/agent/rabbitmq.hcl). Không sửa tay.
  default_user = {{ env "RABBITMQ_ADMIN" }}
  default_pass = {{ with secret "dxos/data/core/rabbitmq/admin" }}{{ .Data.data.password }}{{ end }}
  default_user_tags.administrator = true
  default_vhost = /
  default_permissions.configure = .*
  default_permissions.read = .*
  default_permissions.write = .*
  EOT
}
