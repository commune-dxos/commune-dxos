-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Không hồ sơ nào đóng trước khi nộp; tháng khớp ngày đóng.
select ho_so_id
from {{ ref('fct_ho_so') }}
where ngay_hoan_tat < ngay_nhan
   or so_gio_giai_quyet < 0
   or thang <> date_trunc('month', ngay_hoan_tat)
