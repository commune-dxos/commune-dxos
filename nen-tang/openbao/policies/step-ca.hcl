# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Danh tính `step-ca` (#77): CA nội bộ. Đọc mật khẩu giải mã khóa CA (ca) và mật khẩu provisioner
# ký tài liệu (provisioner, cần khi khởi tạo CA lần đầu). Không đọc bí mật nào khác, không ghi.
path "dxos/data/core/step-ca/ca" {
  capabilities = ["read"]
}
path "dxos/data/core/step-ca/provisioner" {
  capabilities = ["read"]
}
