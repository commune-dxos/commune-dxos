// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Hạn xử lý hồ sơ cho cổng cán bộ. Nguồn: biến hanXuLyLuc của quy trình (mot-cua-api đặt khi khởi
// tạo = ho_so.han_xu_ly + 17:00 giờ Việt Nam) và biến quaHan (hẹn giờ trong BPMN đặt true khi tới hạn).
// Thiếu hanXuLyLuc thì dựng lại từ cột han_xu_ly theo cùng quy ước (main.py GIO_HET_HAN).
// "Sắp trễ" = còn ≤ 1 ngày (24 giờ). Cảnh báo đẩy realtime qua RabbitMQ là #56, ở đây chỉ tính từ
// dữ liệu đã có.

export const GIO_HET_HAN = "T17:00:00+07:00";
export const NGUONG_SAP_TRE_MS = 24 * 60 * 60 * 1000;

export type MucHan = "qua_han" | "sap_tre" | "con_han" | "khong_ro";

export interface DanhGiaHan {
  muc: MucHan;
  /** Hạn dạng Date, null nếu không có. */
  han: Date | null;
  /** ms còn lại (âm = đã quá hạn), null nếu không có hạn. */
  conLaiMs: number | null;
  /** "Còn 5 giờ", "Quá hạn 2 ngày", "Chưa có hạn". */
  nhan: string;
}

export const TEN_MUC_HAN: Record<MucHan, string> = {
  qua_han: "Quá hạn",
  sap_tre: "Sắp trễ hạn",
  con_han: "Còn hạn",
  khong_ro: "Chưa có hạn",
};

const THU_TU_MUC: Record<MucHan, number> = { qua_han: 0, sap_tre: 1, con_han: 2, khong_ro: 3 };

/** hanXuLyLuc (ISO có múi giờ) hoặc han_xu_ly (YYYY-MM-DD) → Date; không hợp lệ → null. */
export function hanLuc(hanXuLyLuc?: string | null, hanXuLy?: string | null): Date | null {
  const chuoi = hanXuLyLuc || (hanXuLy && /^\d{4}-\d{2}-\d{2}$/.test(hanXuLy) ? hanXuLy + GIO_HET_HAN : null);
  if (!chuoi) return null;
  const d = new Date(chuoi);
  return Number.isNaN(d.getTime()) ? null : d;
}

const GIO = 60 * 60 * 1000;
const NGAY = 24 * GIO;

/** Khoảng thời gian ngắn gọn: "dưới 1 giờ", "5 giờ", "1 ngày 4 giờ", "3 ngày". */
export function khoangThoiGian(ms: number): string {
  const a = Math.abs(ms);
  if (a < GIO) return "dưới 1 giờ";
  if (a < NGAY) return `${Math.floor(a / GIO)} giờ`;
  const ngay = Math.floor(a / NGAY);
  const gio = Math.floor((a % NGAY) / GIO);
  return ngay < 3 && gio > 0 ? `${ngay} ngày ${gio} giờ` : `${ngay} ngày`;
}

export function danhGiaHan(han: Date | null, bayGio: Date, quaHan = false): DanhGiaHan {
  if (!han) {
    return quaHan
      ? { muc: "qua_han", han: null, conLaiMs: null, nhan: "Quá hạn" }
      : { muc: "khong_ro", han: null, conLaiMs: null, nhan: TEN_MUC_HAN.khong_ro };
  }
  const conLaiMs = han.getTime() - bayGio.getTime();
  if (quaHan || conLaiMs < 0) {
    return { muc: "qua_han", han, conLaiMs, nhan: conLaiMs < 0 ? `Quá hạn ${khoangThoiGian(conLaiMs)}` : "Quá hạn" };
  }
  return {
    muc: conLaiMs <= NGUONG_SAP_TRE_MS ? "sap_tre" : "con_han",
    han,
    conLaiMs,
    nhan: `Còn ${khoangThoiGian(conLaiMs)}`,
  };
}

/** Quá hạn trước, rồi sắp trễ, còn hạn, không rõ; cùng mức thì hạn sớm hơn trước. */
export function soSanhHan(a: DanhGiaHan, b: DanhGiaHan): number {
  return (
    THU_TU_MUC[a.muc] - THU_TU_MUC[b.muc] ||
    (a.han?.getTime() ?? Number.POSITIVE_INFINITY) - (b.han?.getTime() ?? Number.POSITIVE_INFINITY)
  );
}

const DINH_DANG_HAN = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** "17:00 24/10/2026" theo giờ Việt Nam. */
export function ngayGio(d: Date): string {
  const p = Object.fromEntries(DINH_DANG_HAN.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.hour}:${p.minute} ${p.day}/${p.month}/${p.year}`;
}
