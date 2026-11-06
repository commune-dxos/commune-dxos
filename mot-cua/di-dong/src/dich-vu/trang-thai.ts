// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Tên hiển thị của mot_cua.ho_so.trang_thai, cùng bảng với cổng công dân (#73).

export const TEN_TRANG_THAI: Record<string, string> = {
  moi: 'Mới nộp, chờ tiếp nhận',
  dang_xu_ly: 'Đang xử lý',
  cho_bo_sung: 'Chờ công dân bổ sung',
  cho_phe_duyet: 'Chờ lãnh đạo phê duyệt',
  hoan_tat: 'Hoàn tất',
  tu_choi: 'Từ chối',
};

/** Giá trị lạ (CSDL mới hơn app) → hiện nguyên mã, không đoán. */
export function tenTrangThai(ma: string) {
  return TEN_TRANG_THAI[ma] ?? ma;
}

export type SacTrangThai = 'xong' | 'can-chu-y' | 'dang-di';

export function sacTrangThai(ma: string): SacTrangThai {
  if (ma === 'hoan_tat') return 'xong';
  if (ma === 'cho_bo_sung' || ma === 'tu_choi') return 'can-chu-y';
  return 'dang-di';
}
