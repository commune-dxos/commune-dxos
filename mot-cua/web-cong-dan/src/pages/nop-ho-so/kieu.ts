// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Dữ liệu form nộp hồ sơ: chỉ các cột công dân được nhập vào mot_cua.ho_so (họ tên, số điện thoại)
// và tệp theo thành phần hồ sơ của gói thủ tục.
import { loaiTheoDuoi } from "@/lib/ho-so";

export interface NguoiNop {
  hoTen: string;
  soDienThoai: string;
}

/** Mỗi lỗi gắn với id ô nhập để tóm tắt lỗi đầu form trỏ tới được. */
export type Loi = { id: string; thongDiep: string }[];

export const CAC_BUOC = [
  { duong: "nguoi-nop", ten: "Người nộp" },
  { duong: "giay-to", ten: "Giấy tờ" },
  { duong: "kiem-tra", ten: "Kiểm tra lại" },
] as const;

export type DuongBuoc = (typeof CAC_BUOC)[number]["duong"];

/** Khớp FILE_MAX_BYTES của mot-cua-api và giới hạn body 10 MiB của route /files ở APISIX. */
export const TEP_TOI_DA = 10 * 1024 * 1024;
export const NHAN_TEP = ".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf";

export function chuanSoDienThoai(s: string) {
  return s.replace(/[\s.]/g, "");
}

export function kiemNguoiNop(n: NguoiNop): Loi {
  const loi: Loi = [];
  if (!n.hoTen.trim()) loi.push({ id: "ho-ten", thongDiep: "Nhập họ và tên người nộp" });
  const so = chuanSoDienThoai(n.soDienThoai);
  if (!so) loi.push({ id: "so-dien-thoai", thongDiep: "Nhập số điện thoại" });
  else if (!/^0\d{9}$/.test(so))
    loi.push({ id: "so-dien-thoai", thongDiep: "Số điện thoại gồm 10 chữ số, bắt đầu bằng 0, ví dụ 0912 345 678" });
  return loi;
}

/** Tệp không nhận được thì trả câu báo lỗi (mot-cua-api kiểm lại: đuôi, magic bytes, ClamAV). */
export function kiemMotTep(f: File) {
  if (!loaiTheoDuoi(f.name)) return `Tệp ${f.name} phải là JPG, PNG hoặc PDF`;
  if (f.size === 0) return `Tệp ${f.name} rỗng`;
  if (f.size > TEP_TOI_DA) return `Tệp ${f.name} lớn hơn 10 MB`;
  return null;
}

export function dungLuong(byte: number) {
  return byte < 1024 * 1024 ? `${Math.max(1, Math.round(byte / 1024))} KB` : `${(byte / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
