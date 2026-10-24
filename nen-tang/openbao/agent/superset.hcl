# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# bao agent một lần cho danh tính `superset` (dịch vụ superset-secrets, #82): render SECRET_KEY, mật khẩu
# role `superset` (metadata) và `bao_cao_doc` (đọc báo cáo) ra tệp quyền 0400, chủ uid 1000 (user superset
# của image apache/superset), rồi thoát. Policy: nen-tang/openbao/policies/superset.hcl.

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
  destination          = "/run/dxos-secrets/secret_key"
  perms                = "0400"
  error_on_missing_key = true
  contents             = "{{ with secret \"dxos/data/core/superset\" }}{{ .Data.data.secret_key }}{{ end }}"
}

template {
  destination          = "/run/dxos-secrets/db_password"
  perms                = "0400"
  error_on_missing_key = true
  contents             = "{{ with secret \"dxos/data/core/db/superset\" }}{{ .Data.data.password }}{{ end }}"
}

template {
  destination          = "/run/dxos-secrets/bao_cao_doc_password"
  perms                = "0400"
  error_on_missing_key = true
  contents             = "{{ with secret \"dxos/data/core/db/bao_cao_doc\" }}{{ .Data.data.password }}{{ end }}"
}
