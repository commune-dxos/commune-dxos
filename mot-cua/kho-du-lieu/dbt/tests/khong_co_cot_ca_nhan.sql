-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Không bảng nào của kho (nguồn Parquet và model) có cột dữ liệu cá nhân.
select table_name, column_name
from information_schema.columns
where lower(column_name) in ('ho_ten_nguoi_nop', 'ho_ten', 'so_dien_thoai', 'nguoi_nop_sub', 'nguoi_sub', 'ly_do',
                             'email', 'cccd', 'dia_chi', 'ngay_sinh', 'ten_tep')
