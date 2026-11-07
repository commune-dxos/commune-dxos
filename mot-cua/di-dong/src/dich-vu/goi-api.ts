// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Gọi lõi qua APISIX như cổng công dân (mot-cua/web-cong-dan/src/lib/goi-api.ts). Lỗi đổi thành LoiApi có
// câu tiếng Việt trung tính: mot-cua-api trả {"loi": "câu tiếng Việt"} nên hiện nguyên câu đó; PostgREST
// trả {"message": …} bằng tiếng Anh nên không hiện cho người dân.
import { cauHinh as cauHinhMacDinh, type CauHinh } from '../cau-hinh/moi-truong';

export const KHONG_KET_NOI = 'Chưa kết nối được tới máy chủ. Vui lòng kiểm tra mạng rồi thử lại.';
export const HET_PHIEN = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';

/** Lỗi có câu thông báo dành cho người dân. trangThai = null khi chưa tới được máy chủ. */
export class LoiApi extends Error {
  readonly trangThai: number | null;
  constructor(thongDiep: string, trangThai: number | null) {
    super(thongDiep);
    this.name = 'LoiApi';
    this.trangThai = trangThai;
  }
}

export function thongDiepLoi(trangThai: number) {
  if (trangThai === 401) return HET_PHIEN;
  if (trangThai === 404) return 'Không tìm thấy dữ liệu yêu cầu.';
  if (trangThai === 429) return 'Có nhiều lượt truy cập cùng lúc. Vui lòng đợi một phút rồi thử lại.';
  if (trangThai >= 500) return 'Hệ thống đang bận hoặc bảo trì. Vui lòng thử lại sau ít phút.';
  return `Chưa xử lý được yêu cầu (mã ${trangThai}).`;
}

export interface TuyChonGoi {
  method?: 'GET' | 'POST' | 'PATCH';
  token?: string;
  headers?: Record<string, string>;
  body?: string | Blob;
}

export type HamFetch = (url: string, init: RequestInit) => Promise<Response>;

export async function goiGateway<T>(
  duong: string,
  tuyChon: TuyChonGoi = {},
  cauHinh: CauHinh = cauHinhMacDinh,
  goi: HamFetch = (u, i) => fetch(u, i),
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...tuyChon.headers };
  if (tuyChon.token) headers.Authorization = `Bearer ${tuyChon.token}`;
  let res: Response;
  try {
    res = await goi(cauHinh.gatewayUrl + duong, {
      method: tuyChon.method ?? 'GET',
      headers,
      body: tuyChon.body,
    });
  } catch {
    throw new LoiApi(KHONG_KET_NOI, null);
  }
  const than = await res.text();
  let json: unknown = null;
  try {
    json = than ? (JSON.parse(than) as unknown) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const loi = (json as { loi?: unknown } | null)?.loi;
    const thongDiep =
      typeof loi === 'string' && res.status !== 401 && res.status < 500 && res.status !== 429
        ? loi
        : thongDiepLoi(res.status);
    throw new LoiApi(thongDiep, res.status);
  }
  return json as T;
}

/** Câu hiện cho người dân từ một lỗi bất kỳ. */
export function cauLoi(loi: unknown) {
  if (loi instanceof LoiApi) return loi.message;
  return 'Đã có lỗi ngoài dự kiến. Vui lòng thử lại.';
}
