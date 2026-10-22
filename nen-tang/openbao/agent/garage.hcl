# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# bao agent một lần cho danh tính `garage` (dịch vụ garage-secrets trong docker-compose.yml):
# đăng nhập AppRole bằng role_id/secret_id do bao-init đặt trong volume garage-secrets, render
# bí mật ra tệp quyền 0400 trong chính volume đó rồi thoát. Chạy bằng root như Garage (Garage
# từ chối tệp bí mật mà người khác đọc được). Policy: nen-tang/openbao/policies/garage.hcl. Đọc
# sai đường dẫn (policy chặn) → thoát mã 1 ngay.

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
  destination          = "/run/dxos-secrets/rpc_secret"
  perms                = "0400"
  error_on_missing_key = true
  contents             = "{{ with secret \"dxos/data/core/garage\" }}{{ .Data.data.rpc_secret }}{{ end }}"
}

template {
  destination          = "/run/dxos-secrets/admin_token"
  perms                = "0400"
  error_on_missing_key = true
  contents             = "{{ with secret \"dxos/data/core/garage\" }}{{ .Data.data.admin_token }}{{ end }}"
}
