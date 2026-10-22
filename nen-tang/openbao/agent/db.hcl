# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# bao agent một lần cho danh tính `db` (dịch vụ db-secrets trong docker-compose.yml): đăng
# nhập AppRole bằng role_id/secret_id do bao-init đặt trong volume db-secrets, render bí mật
# ra tệp quyền 0400 trong chính volume đó rồi thoát. Chạy bằng uid 70 (postgres của image
# alpine) để PostgreSQL đọc được POSTGRES_PASSWORD_FILE; db-init và tang2-migrate chạy bằng
# root. Policy: nen-tang/openbao/policies/db.hcl. Đọc sai đường dẫn (policy chặn) → thoát mã 1
# ngay.

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
  destination          = "/run/dxos-secrets/postgres_password"
  perms                = "0400"
  error_on_missing_key = true
  contents             = "{{ with secret \"dxos/data/core/db/postgres\" }}{{ .Data.data.password }}{{ end }}"
}

template {
  destination          = "/run/dxos-secrets/pgpass"
  perms                = "0400"
  error_on_missing_key = true
  contents             = "postgres:5432:*:{{ env \"POSTGRES_USER\" }}:{{ with secret \"dxos/data/core/db/postgres\" }}{{ .Data.data.password }}{{ end }}"
}

template {
  destination          = "/run/dxos-secrets/authenticator_password"
  perms                = "0400"
  error_on_missing_key = true
  contents             = "{{ with secret \"dxos/data/core/db/authenticator\" }}{{ .Data.data.password }}{{ end }}"
}

template {
  destination          = "/run/dxos-secrets/keycloak_password"
  perms                = "0400"
  error_on_missing_key = true
  contents             = "{{ with secret \"dxos/data/core/db/keycloak\" }}{{ .Data.data.password }}{{ end }}"
}

template {
  destination          = "/run/dxos-secrets/flowable_password"
  perms                = "0400"
  error_on_missing_key = true
  contents             = "{{ with secret \"dxos/data/core/db/flowable\" }}{{ .Data.data.password }}{{ end }}"
}
