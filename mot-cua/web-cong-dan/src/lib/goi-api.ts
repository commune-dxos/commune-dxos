// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Gọi lõi qua APISIX bằng access token (cổng công dân nộp hồ sơ, cổng cán bộ xử lý hồ sơ). Lỗi đổi
// thành LoiApi có câu tiếng Việt: mot-cua-api trả {"loi": "câu tiếng Việt"} (ví dụ 403 "Không thuộc
// nhóm được giao task này") nên hiện nguyên câu đó; PostgREST trả {"message": …} bằng tiếng Anh nên
// không hiện cho người dùng.
import { LoiApi, thongDiepLoi } from "./api";
import type { CauHinh } from "./cau-hinh";

const KHONG_KET_NOI = "Không kết nối được tới máy chủ. Vui lòng kiểm tra mạng rồi thử lại.";

export async function goiGateway<T>(
  cauHinh: CauHinh,
  goi: typeof fetch,
  duong: string,
  init: RequestInit & { token?: string },
): Promise<T> {
  const { token, headers, ...con } = init;
  const h = new Headers(headers);
  h.set("Accept", "application/json");
  if (token) h.set("Authorization", `Bearer ${token}`);
  let res: Response;
  try {
    res = await goi(cauHinh.gatewayUrl + duong, { ...con, headers: h });
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
      res.status === 401
        ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
        : typeof loi === "string" && res.status < 500 && res.status !== 429
          ? loi
          : thongDiepLoi(res.status);
    throw new LoiApi(thongDiep, res.status);
  }
  return json as T;
}
