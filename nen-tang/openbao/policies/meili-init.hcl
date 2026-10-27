# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Danh tính `meili-init`: dùng khóa chủ Meilisearch để cấp khóa API riêng của dịch vụ Tầng 2 (chỉ index
# có tiền tố <DXOS_TANG2>-), rồi ghi khóa đó cho Tầng 2 (#91). Không đọc được nhánh core/db.
path "dxos/data/core/meilisearch" {
  capabilities = ["read"]
}
path "dxos/data/tang2/${DXOS_TANG2}/meilisearch" {
  capabilities = ["create", "update", "read"]
}
