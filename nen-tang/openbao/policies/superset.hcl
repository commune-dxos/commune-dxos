# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Danh tính `superset` (#82): Superset và superset-init. Đọc khóa SECRET_KEY, mật khẩu role metadata
# `superset` và role chỉ đọc báo cáo `bao_cao_doc`; không đọc mật khẩu CSDL nào khác, không ghi.
path "dxos/data/core/superset" {
  capabilities = ["read"]
}
path "dxos/data/core/db/superset" {
  capabilities = ["read"]
}
path "dxos/data/core/db/bao_cao_doc" {
  capabilities = ["read"]
}
