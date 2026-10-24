-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Lịch từ ngày nộp sớm nhất tới ngày đóng muộn nhất: ngày làm việc = thứ Hai–Sáu và không phải
-- ngày nghỉ (cùng quy tắc với mot_cua_noi_bo.la_ngay_lam_viec trong PostgreSQL).
with pham_vi as (
    select min(cast(ngay_nhan as date)) as tu_ngay, max(cast(ngay_hoan_tat as date)) as den_ngay
    from {{ ref('stg_ho_so') }}
),

ngay as (
    select cast(unnest(generate_series(tu_ngay, den_ngay, interval 1 day)) as date) as ngay
    from pham_vi
    where tu_ngay is not null
)

select
    ngay.ngay,
    isodow(ngay.ngay) < 6 and nghi.ngay is null as la_ngay_lam_viec
from ngay
left join {{ ref('stg_ngay_nghi') }} as nghi on nghi.ngay = ngay.ngay
