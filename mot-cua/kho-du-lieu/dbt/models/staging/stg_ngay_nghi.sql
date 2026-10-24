-- SPDX-FileCopyrightText: 2026 DTU_DZ_2
-- SPDX-License-Identifier: GPL-3.0-or-later
select ngay from {{ source('kho', 'ngay_nghi') }}
