// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Cách viết thời hạn và lệ phí cho người dân (khớp trang danh mục MkDocs, scripts/tai_lieu_hooks.py).

const dong = new Intl.NumberFormat("vi-VN");

export function thoiHan(soNgayLamViec: number) {
  return soNgayLamViec === 0 ? "Trong ngày" : `${soNgayLamViec} ngày làm việc`;
}

export function lePhi(dongVn: number) {
  return dongVn === 0 ? "Miễn phí" : `${dong.format(dongVn)} đồng`;
}

/** Ngày dạng YYYY-MM-DD (cột date của PostgreSQL) → dd/mm/yyyy, không đổi múi giờ. */
export function ngay(isoNgay: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoNgay);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : isoNgay;
}

/** Bỏ dấu tiếng Việt và viết thường, để ô tìm "khai sinh" khớp "Đăng ký khai sinh". */
export function chuanHoa(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}
