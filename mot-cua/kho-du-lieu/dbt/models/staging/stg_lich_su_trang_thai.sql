-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Lịch sử chuyển trạng thái của hồ sơ đã đóng.
select
    id,
    ho_so_id,
    tu_trang_thai,
    den_trang_thai,
    buoc,
    nguon,
    luc
from {{ source('kho', 'lich_su_trang_thai') }}
