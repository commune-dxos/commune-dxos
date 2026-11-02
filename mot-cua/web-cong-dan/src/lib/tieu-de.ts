// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Tiêu đề tab trình duyệt cho các trang cổng công dân (cổng cán bộ đặt riêng trong từng trang).
import { useEffect } from "react";

export const TEN_CONG = "Cổng dịch vụ công xã";

/** Đặt `document.title` = "<tieuDe> – Cổng dịch vụ công xã"; bỏ trống thì giữ nguyên tiêu đề hiện tại. */
export function useTieuDeTrang(tieuDe: string | undefined) {
  useEffect(() => {
    if (tieuDe) document.title = `${tieuDe} – ${TEN_CONG}`;
  }, [tieuDe]);
}
