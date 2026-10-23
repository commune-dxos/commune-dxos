-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Thời gian giải quyết và tỷ lệ trễ hạn theo tháng đóng hồ sơ × thủ tục (kèm lĩnh vực).
select
    thang,
    linh_vuc,
    ten_linh_vuc,
    thu_tuc,
    ten_thu_tuc,
    cast(count(*) as integer) as so_ho_so,
    cast(count(*) filter (where ket_qua = 'hoan_tat') as integer) as so_hoan_tat,
    cast(count(*) filter (where ket_qua = 'tu_choi') as integer) as so_tu_choi,
    cast(count(*) filter (where tre_han) as integer) as so_tre_han,
    round(count(*) filter (where tre_han) / count(*), 4) as ty_le_tre_han,
    round(avg(so_ngay_lam_viec), 2) as tb_ngay_lam_viec,
    round(avg(so_gio_giai_quyet), 2) as tb_gio_giai_quyet
from {{ ref('fct_ho_so') }}
group by thang, linh_vuc, ten_linh_vuc, thu_tuc, ten_thu_tuc
