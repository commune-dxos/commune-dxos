-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Mỗi (tháng, thủ tục) đúng một dòng: khóa chính của bao_cao.hieu_suat_thang.
select thang, thu_tuc, count(*) as so_dong
from {{ ref('hieu_suat_thang') }}
group by thang, thu_tuc
having count(*) > 1
