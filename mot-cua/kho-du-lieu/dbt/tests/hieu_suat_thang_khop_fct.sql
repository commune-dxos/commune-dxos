-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Tổng hợp không mất hay nhân bản hồ sơ; tỷ lệ trễ hạn trong [0, 1], số đếm cộng đúng.
select 'tong_so_ho_so' as loi
from (select sum(so_ho_so) as tong from {{ ref('hieu_suat_thang') }}) as m
where m.tong is distinct from (select count(*) from {{ ref('fct_ho_so') }})
union all
select 'ty_le_ngoai_khoang' from {{ ref('hieu_suat_thang') }} where ty_le_tre_han < 0 or ty_le_tre_han > 1
union all
select 'dem_khong_cong_dung' from {{ ref('hieu_suat_thang') }}
where so_hoan_tat + so_tu_choi <> so_ho_so or so_tre_han > so_ho_so
