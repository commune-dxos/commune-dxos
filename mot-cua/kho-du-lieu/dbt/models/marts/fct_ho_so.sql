-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Một dòng mỗi hồ sơ đã đóng, kèm thước đo thời gian giải quyết và trễ hạn.
with bo_sung as (
    select ho_so_id, count(*) filter (where den_trang_thai = 'cho_bo_sung') as so_lan_bo_sung
    from {{ ref('stg_lich_su_trang_thai') }}
    group by ho_so_id
),

ngay_lam_viec as (
    select h.ho_so_id, count(l.ngay) as so_ngay_lam_viec
    from {{ ref('stg_ho_so') }} as h
    left join {{ ref('int_lich_lam_viec') }} as l
        on l.la_ngay_lam_viec
        and l.ngay > cast(h.ngay_nhan as date)
        and l.ngay <= cast(h.ngay_hoan_tat as date)
    group by h.ho_so_id
)

select
    h.ho_so_id,
    h.ma_ho_so,
    h.thu_tuc,
    h.ten_thu_tuc,
    h.linh_vuc,
    h.ten_linh_vuc,
    h.ket_qua,
    h.thang,
    h.ngay_nhan,
    h.ngay_hoan_tat,
    h.han_xu_ly,
    h.so_ngay_quy_dinh,
    round(date_diff('second', h.ngay_nhan, h.ngay_hoan_tat) / 3600.0, 2) as so_gio_giai_quyet,
    cast(n.so_ngay_lam_viec as integer) as so_ngay_lam_viec,
    cast(coalesce(b.so_lan_bo_sung, 0) as integer) as so_lan_bo_sung,
    coalesce(h.ngay_hoan_tat > h.han_xu_ly + interval 17 hour, false) as tre_han
from {{ ref('stg_ho_so') }} as h
inner join ngay_lam_viec as n on n.ho_so_id = h.ho_so_id
left join bo_sung as b on b.ho_so_id = h.ho_so_id
