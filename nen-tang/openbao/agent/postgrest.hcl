# SPDX-License-Identifier: Apache-2.0
# bao agent một lần cho danh tính `postgrest` (dịch vụ postgrest-secrets trong
# docker-compose.yml): đăng nhập AppRole bằng role_id/secret_id do bao-init đặt trong volume
# postgrest-secrets, render bí mật ra tệp quyền 0400 trong chính volume đó rồi thoát. Chạy
# bằng uid 1000 như PostgREST. PostgREST đọc PGRST_DB_URI=@/run/dxos-secrets/db-uri. Policy:
# nen-tang/openbao/policies/postgrest.hcl. Đọc sai đường dẫn (policy chặn) → thoát mã 1 ngay.

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
  destination          = "/run/dxos-secrets/db-uri"
  perms                = "0400"
  error_on_missing_key = true
  contents             = "postgres://authenticator:{{ with secret \"dxos/data/core/db/authenticator\" }}{{ .Data.data.password }}{{ end }}@postgres:5432/{{ env \"POSTGRES_DB\" }}"
}
