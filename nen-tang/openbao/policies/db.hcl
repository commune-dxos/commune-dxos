# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Danh tính `db`: PostgreSQL (initdb), db-init, tang2-migrate. Superuser đặt mật khẩu cho
# mọi role đăng nhập nên cần đọc mật khẩu CSDL của các role; không đọc gì khác.
path "dxos/data/core/db/*" {
  capabilities = ["read"]
}
