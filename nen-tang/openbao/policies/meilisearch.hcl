# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Danh tính `meilisearch`: agent một lần meilisearch-secrets render khóa chủ thành tệp cấu hình của
# Meilisearch (#91). Chỉ đọc đúng khóa chủ.
path "dxos/data/core/meilisearch" {
  capabilities = ["read"]
}
