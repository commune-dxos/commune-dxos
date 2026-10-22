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
