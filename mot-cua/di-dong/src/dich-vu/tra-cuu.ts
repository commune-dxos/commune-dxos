// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Tra cứu tiến độ hồ sơ không cần đăng nhập (#54, migration 012):
//   GET /public/rpc/tra_cuu_ho_so?p_ma=&p_so_cuoi=   mã hồ sơ + 4 số cuối số điện thoại đã khai khi nộp
// Chỉ trả trạng thái và các mốc, không có họ tên, số điện thoại, lý do; sai mã hoặc số → null.
import type { CauHinh } from '../cau-hinh/moi-truong';
import { goiGateway, type HamFetch } from './goi-api';

export interface KetQuaTraCuu {
  ma_ho_so: string;
  thu_tuc: { ma: string; ten: string };
  trang_thai: string;
  ngay_nhan: string;
  han_xu_ly: string | null;
  ngay_hoan_tat: string | null;
  lich_su: { trang_thai: string; luc: string; ly_do?: string | null }[];
}

/** Mã hồ sơ do CSDL cấp: HS + ngày nộp + số thứ tự (HS20261024-000123). Viết thường, thừa cách vẫn nhận. */
export function chuanHoaMa(ma: string) {
  return ma.replace(/\s+/g, '').toUpperCase();
}

export function kiemNhapTraCuu(ma: string, soCuoi: string) {
  const loi: { ma?: string; soCuoi?: string } = {};
  if (!/^HS\d{8}-[0-9A-Z]{1,10}$/.test(chuanHoaMa(ma))) {
    loi.ma = 'Nhập mã hồ sơ in trên biên nhận, ví dụ HS20261024-000123.';
  }
  if (!/^\d{4}$/.test(soCuoi.trim())) loi.soCuoi = 'Nhập đúng 4 chữ số cuối của số điện thoại đã khai khi nộp.';
  return loi;
}

export function traCuuCongKhai(ma: string, soCuoi: string, cauHinh?: CauHinh, goi?: HamFetch) {
  const q = `p_ma=${encodeURIComponent(chuanHoaMa(ma))}&p_so_cuoi=${encodeURIComponent(soCuoi.trim())}`;
  return goiGateway<KetQuaTraCuu | null>(`/public/rpc/tra_cuu_ho_so?${q}`, {}, cauHinh, goi);
}
