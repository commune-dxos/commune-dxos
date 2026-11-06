// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Cách viết thời hạn, lệ phí, ngày cho người dân (khớp cổng công dân và trang danh mục MkDocs).

export function thoiHan(soNgayLamViec: number) {
  return soNgayLamViec === 0 ? 'Trong ngày' : `${soNgayLamViec} ngày làm việc`;
}

/** Nhóm nghìn bằng dấu chấm, không phụ thuộc Intl (Hermes trên Android có thể thiếu dữ liệu vi-VN). */
export function lePhi(dongVn: number) {
  if (dongVn === 0) return 'Miễn phí';
  return `${String(Math.round(dongVn)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} đồng`;
}

/** Ngày dạng YYYY-MM-DD (cột date của PostgreSQL) → dd/mm/yyyy, không đổi múi giờ. */
export function ngay(isoNgay: string | null | undefined) {
  if (!isoNgay) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoNgay);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : isoNgay;
}

/** Thời điểm (timestamptz) → "hh:mm dd/mm/yyyy" theo giờ của máy. */
export function ngayGio(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hai = (n: number) => String(n).padStart(2, '0');
  return `${hai(d.getHours())}:${hai(d.getMinutes())} ${hai(d.getDate())}/${hai(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Bỏ dấu tiếng Việt và viết thường, để ô tìm "khai sinh" khớp "Đăng ký khai sinh". */
export function chuanHoa(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}
