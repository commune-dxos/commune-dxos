// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Bảng màu, cỡ chữ, khoảng cách theo cổng công dân (mot-cua/web-cong-dan/src/index.css): teal chính
// #0f766e, chàm phụ, chữ lớn (thân 18) cho người lớn tuổi đọc dễ. Tỉ lệ tương phản ghi theo bản web.
// Chỉ có chế độ sáng như cổng công dân.

export const mau = {
  nen: '#ffffff',
  chu: '#0f172a',
  nenPhu: '#f8fafc', // slate-50: nền màn, khối phụ
  the: '#ffffff',
  chinh: '#0f766e',
  chinhDam: '#115e59', // chữ trắng 7.58:1
  chuTrenChinh: '#ffffff',
  chinhNhat: '#f0fdfa', // teal-50
  chuTrenChinhNhat: '#134e4a', // 9.3:1
  phu: '#eef2ff',
  chuTrenPhu: '#3730a3', // 8.88:1
  lienKet: '#4338ca',
  mo: '#f1f5f9', // slate-100
  chuMo: '#475569', // slate-600: 7.58:1 trên trắng
  canhBao: '#d9480f',
  loi: '#b53a0b',
  loiNhat: '#fff4ed',
  vien: '#e2e8f0', // slate-200
  vienONhap: '#64748b', // slate-500: 4.76:1
} as const;

export const chu = {
  nho: 15,
  than: 17,
  lon: 19,
  tieuDe: 22,
  tieuDeLon: 28,
} as const;

export const khoang = {
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 24,
  xxl: 32,
} as const;

export const bo = {
  nho: 8,
  vua: 12,
  tron: 999,
} as const;
