// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Giấy tờ có ký số của hồ sơ (#77), như cổng công dân (mot-cua/web-cong-dan/src/lib/giay-to.ts):
//   POST /files/ho-so/{id}/giay-to/{loai}   mot-cua-api phát hành nếu chưa có (PDF ký PAdES bằng chứng thư
//                                            của xã), trả metadata + link GET ký sẵn qua APISIX /files/s3/…
// Biên nhận phát hành ngay khi hồ sơ vào quy trình; thông báo kết quả chỉ có khi hồ sơ hoàn tất.
// App mở link bằng trình duyệt của máy (Linking): trình duyệt tải PDF về đúng tên tệp nhờ
// response-content-disposition trong link, không cần thêm quyền ghi bộ nhớ.
import { Linking } from 'react-native';
import { cauHinh as cauHinhMacDinh, type CauHinh } from '../cau-hinh/moi-truong';
import { LoiApi, goiGateway, type HamFetch } from './goi-api';

export type LoaiGiayTo = 'bien_nhan' | 'ket_qua';

export interface GiayToKy {
  id: string;
  loai: LoaiGiayTo;
  sha256: string;
  kich_thuoc: number;
  chung_thu_ten: string;
  ky_luc: string;
  maHoSo: string;
  /** Link GET ký sẵn, hết hạn lúc hetHanLuc. */
  link: string;
  hetHanLuc: string;
}

export function phatHanhGiayTo(
  token: string,
  hoSoId: string,
  loai: LoaiGiayTo,
  cauHinh: CauHinh = cauHinhMacDinh,
  goi?: HamFetch,
) {
  return goiGateway<GiayToKy>(
    `/files/ho-so/${encodeURIComponent(hoSoId)}/giay-to/${loai}`,
    { method: 'POST', token },
    cauHinh,
    goi,
  );
}

/** Máy chủ cấu hình thiếu GATEWAY_URL thì link là đường dẫn tương đối: ghép với cổng app đang dùng. */
export function linkTuyetDoi(link: string, cauHinh: CauHinh = cauHinhMacDinh) {
  return /^https?:\/\//.test(link) ? link : cauHinh.gatewayUrl + (link.startsWith('/') ? '' : '/') + link;
}

/** Biên nhận: mọi hồ sơ đã nộp (chưa vào quy trình thì máy chủ trả 409 kèm câu tiếng Việt). Kết quả: khi hoàn tất. */
export function coGiayTo(trangThai: string, loai: LoaiGiayTo) {
  return loai === 'bien_nhan' || trangThai === 'hoan_tat';
}

/** Phát hành rồi mở link tải bằng trình duyệt của máy. */
export async function taiGiayTo(
  layToken: () => Promise<string>,
  hoSoId: string,
  loai: LoaiGiayTo,
  mo: (url: string) => Promise<unknown> = url => Linking.openURL(url),
  cauHinh: CauHinh = cauHinhMacDinh,
  goi?: HamFetch,
) {
  const g = await phatHanhGiayTo(await layToken(), hoSoId, loai, cauHinh, goi);
  try {
    await mo(linkTuyetDoi(g.link, cauHinh));
  } catch {
    throw new LoiApi('Máy chưa mở được tệp PDF. Vui lòng cài trình duyệt hoặc ứng dụng đọc PDF rồi thử lại.', null);
  }
  return g;
}
