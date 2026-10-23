# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# bao agent một lần cho danh tính `step-ca` (dịch vụ step-ca-secrets, #77): render mật khẩu khóa CA
# và mật khẩu provisioner ra tệp quyền 0400 (chủ uid 1000 = user step của image smallstep/step-ca)
# rồi thoát. Policy: nen-tang/openbao/policies/step-ca.hcl.

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
  destination          = "/run/dxos-secrets/password"
  perms                = "0400"
  error_on_missing_key = true
  contents             = "{{ with secret \"dxos/data/core/step-ca/ca\" }}{{ .Data.data.password }}{{ end }}"
}

template {
  destination          = "/run/dxos-secrets/provisioner_password"
  perms                = "0400"
  error_on_missing_key = true
  contents             = "{{ with secret \"dxos/data/core/step-ca/provisioner\" }}{{ .Data.data.password }}{{ end }}"
}
