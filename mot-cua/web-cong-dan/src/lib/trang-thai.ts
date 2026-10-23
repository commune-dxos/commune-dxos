// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Tên hiển thị của mot_cua.ho_so.trang_thai (#73), dùng chung cho cổng cán bộ và cổng công dân. Cột
// này đi theo bước quy trình Flowable (mot-cua/backend/trang_thai.py), nên hai cổng cùng đọc một
// giá trị từ CSDL qua /api thay vì tự suy từ bước.

export const TEN_TRANG_THAI: Record<string, string> = {
  moi: "Mới nộp, chờ tiếp nhận",
  dang_xu_ly: "Đang xử lý",
  cho_bo_sung: "Chờ công dân bổ sung",
  cho_phe_duyet: "Chờ lãnh đạo phê duyệt",
  hoan_tat: "Hoàn tất",
  tu_choi: "Từ chối",
};

/** Giá trị lạ (bản CSDL mới hơn web) → hiện nguyên mã, không đoán. */
export function tenTrangThai(maTrangThai: string) {
  return TEN_TRANG_THAI[maTrangThai] ?? maTrangThai;
}
