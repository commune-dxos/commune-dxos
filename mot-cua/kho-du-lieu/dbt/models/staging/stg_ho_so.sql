-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Hồ sơ đã đóng: đổi tên cột theo nghĩa báo cáo, tháng thành ngày đầu tháng.
select
    ho_so_id,
    ma_ho_so,
    thu_tuc,
    ten_thu_tuc,
    linh_vuc,
    ten_linh_vuc,
    so_ngay_quy_dinh,
    trang_thai as ket_qua,
    ngay_nhan,
    han_xu_ly,
    ngay_hoan_tat,
    cast(thang || '-01' as date) as thang
from {{ source('kho', 'ho_so') }}
