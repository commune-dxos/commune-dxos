# SPDX-License-Identifier: Apache-2.0
# bao agent một lần cho danh tính `flowable` (dịch vụ flowable-secrets trong
# docker-compose.yml): đăng nhập AppRole bằng role_id/secret_id do bao-init đặt trong volume
# flowable-secrets, render bí mật ra tệp quyền 0400 trong chính volume đó rồi thoát. Chạy bằng
# uid 100 như Flowable. Tên tệp là tên thuộc tính Spring Boot: Flowable nạp thư mục bằng
# SPRING_CONFIG_IMPORT=configtree:… Policy: core/openbao/policies/flowable.hcl. Đọc sai đường
# dẫn (policy chặn) → thoát mã 1 ngay.

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
  destination          = "/run/dxos-secrets/flowable/spring.datasource.password"
  perms                = "0400"
  error_on_missing_key = true
  contents             = "{{ with secret \"dxos/data/core/db/flowable\" }}{{ .Data.data.password }}{{ end }}"
}

template {
  destination          = "/run/dxos-secrets/flowable/flowable.rest.app.admin.password"
  perms                = "0400"
  error_on_missing_key = true
  contents             = "{{ with secret \"dxos/data/core/flowable/rest-admin\" }}{{ .Data.data.password }}{{ end }}"
}
