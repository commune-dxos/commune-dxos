// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// TanStack Query: bộ nhớ tạm cho dữ liệu đọc từ lõi. Lỗi 4xx (sai mã, hết phiên, quá nhiều lượt) không
// thử lại vì thử lại không đổi được kết quả; lỗi mạng, 5xx thử lại 2 lần.
import { QueryClient } from '@tanstack/react-query';
import { LoiApi } from '../dich-vu/goi-api';

export function coNenThuLai(soLan: number, loi: unknown) {
  if (loi instanceof LoiApi && loi.trangThai !== null && loi.trangThai >= 400 && loi.trangThai < 500) {
    return false;
  }
  return soLan < 2;
}

export function taoBoTruyVan() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 30 * 60_000,
        retry: coNenThuLai,
        refetchOnReconnect: true,
      },
      mutations: { retry: false },
    },
  });
}

/** Khóa truy vấn tập trung để làm mới đúng chỗ sau khi nộp, đăng xuất. */
export const khoaTruyVan = {
  danhMuc: ['thu-tuc'] as const,
  hoSoCuaToi: ['ho-so-cua-toi'] as const,
  chiTietHoSo: (id: string) => ['ho-so-cua-toi', id] as const,
  traCuu: (ma: string, soCuoi: string) => ['tra-cuu', ma, soCuoi] as const,
};
