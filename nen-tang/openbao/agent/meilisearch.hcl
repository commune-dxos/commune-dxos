# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# bao agent một lần cho danh tính `meilisearch` (dịch vụ meilisearch-secrets trong docker-compose.yml, #91):
# đăng nhập AppRole bằng role_id/secret_id do bao-init đặt trong volume meilisearch-secrets, render tệp cấu
# hình TOML chứa khóa chủ (quyền 0400) trong chính volume đó rồi thoát. Meilisearch đọc tệp bằng
# --config-file-path, nên khóa chủ không nằm trong biến môi trường. Policy:
# nen-tang/openbao/policies/meilisearch.hcl.

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
  destination          = "/run/dxos-secrets/meilisearch.toml"
  perms                = "0400"
  error_on_missing_key = true
  contents             = "master_key = \"{{ with secret \"dxos/data/core/meilisearch\" }}{{ .Data.data.master_key }}{{ end }}\"\n"
}
