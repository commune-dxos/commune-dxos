// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Giấy tờ có ký số của hồ sơ (#77): biên nhận (sau khi hồ sơ vào quy trình) và thông báo kết quả
// (khi hoàn tất), PDF ký PAdES bằng chứng thư của xã do mot-cua-api phát hành:
//   POST /files/ho-so/{id}/giay-to/{loai}   phát hành nếu chưa có, trả metadata + link tải ngắn hạn
// Ai xem được hồ sơ (người nộp, cán bộ phụ trách, lãnh đạo) thì tải được.
import { cauHinh as cauHinhMacDinh, type CauHinh } from "./cau-hinh";
import { goiGateway } from "./goi-api";

export type LoaiGiayTo = "bien_nhan" | "ket_qua";

export const TEN_GIAY_TO: Record<LoaiGiayTo, string> = {
  bien_nhan: "Biên nhận hồ sơ",
  ket_qua: "Thông báo kết quả",
};

export interface GiayToKy {
  id: string;
  loai: LoaiGiayTo;
  sha256: string;
  kich_thuoc: number;
  chung_thu_ten: string;
  ky_luc: string;
  maHoSo: string;
  /** Link GET ký sẵn qua APISIX /files/s3/…, hết hạn lúc hetHanLuc. */
  link: string;
  hetHanLuc: string;
}

export function phatHanhGiayTo(
  token: string,
  hoSoId: string,
  loai: LoaiGiayTo,
  cauHinh: CauHinh = cauHinhMacDinh,
  goi: typeof fetch = (...a) => fetch(...a),
) {
  return goiGateway<GiayToKy>(cauHinh, goi, `/files/ho-so/${encodeURIComponent(hoSoId)}/giay-to/${loai}`, {
    method: "POST",
    token,
  });
}

export function tenTepGiayTo(g: Pick<GiayToKy, "loai" | "maHoSo">) {
  return `${g.loai === "bien_nhan" ? "bien-nhan" : "ket-qua"}-${g.maHoSo}.pdf`;
}

/** Tải về bằng thẻ <a download> (link cùng origin với cổng nên trình duyệt lưu đúng tên tệp). */
export function taiVe(g: GiayToKy, tai: (a: HTMLAnchorElement) => void = (a) => a.click()) {
  const a = document.createElement("a");
  a.href = g.link;
  a.download = tenTepGiayTo(g);
  a.rel = "noopener";
  tai(a);
}
