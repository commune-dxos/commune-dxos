// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Bảng màu, cỡ chữ, khoảng cách theo giao diện mới của cổng công dân (mot-cua/web-cong-dan/src/index.css):
// xanh ngọc #0F766E cho nút chính, chàm #4338CA cho liên kết và bước đang làm, đỏ son #D9480F chỉ cho cảnh
// báo (viền, biểu tượng; chữ lỗi dùng bản đậm #B53A0B). Chữ lớn cho người lớn tuổi: thân 18, không chữ nào
// dưới 16 (trừ nhãn thanh tab 14 theo chuẩn Android), vùng bấm ≥ 48dp. Tỉ lệ tương phản ghi theo bản web.
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
  chinhNhatNhan: '#ccfbf1', // teal-100: nút nhạt khi đang nhấn
  vienChinhNhat: '#99f6e4', // teal-200: viền trang trí của nút nhạt
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
  nho: 16,
  than: 18,
  lon: 20,
  tieuDe: 24,
  tieuDeLon: 30,
} as const;

/** Chiều cao dòng tương ứng (≈ 1.5 lần cỡ chữ) để chữ tiếng Việt có dấu không chạm nhau. */
export const dong = {
  nho: 24,
  than: 28,
  lon: 28,
  tieuDe: 32,
} as const;

/** Vùng bấm tối thiểu (Material: 48dp). */
export const VUNG_BAM = 48;

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
  the: 16,
  tron: 999,
} as const;

/** Bóng thẻ nhẹ như --shadow-the của web. */
export const bong = {
  shadowColor: '#0f172a',
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;
