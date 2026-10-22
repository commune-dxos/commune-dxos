// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Gọi lõi Tầng 1 qua APISIX. Cổng công dân không gọi thẳng PostgREST, Flowable hay Garage.
// Danh mục thủ tục: route /public/* (không token, role anon, 60 request/phút/IP), RLS chỉ trả
// thủ tục cong_khai (mot-cua/db/migrations/002_schema_day_du.sql).
import { cauHinh as cauHinhMacDinh, type CauHinh } from "./cau-hinh";

export interface ThuTuc {
  id: string;
  ma: string;
  ten: string;
  /** Ngày làm việc; 0 = trong ngày. */
  so_ngay_xu_ly: number;
  /** Đồng. */
  le_phi: number;
  ghi_chu_le_phi: string | null;
  /** process id BPMN của gói thu-tuc/<goi>/; null = chưa nhận hồ sơ trực tuyến. */
  quy_trinh: string | null;
  linh_vuc: { ma: string; ten: string } | null;
}

export const DUONG_DAN_DANH_MUC =
  "/public/thu_tuc?select=id,ma,ten,so_ngay_xu_ly,le_phi,ghi_chu_le_phi,quy_trinh," +
  "linh_vuc:linh_vuc_id(ma,ten)&order=ma";

/** Lỗi có câu thông báo dành cho người dân. */
export class LoiApi extends Error {
  readonly trangThai: number | null;
  constructor(thongDiep: string, trangThai: number | null) {
    super(thongDiep);
    this.name = "LoiApi";
    this.trangThai = trangThai;
  }
}

function thongDiepLoi(trangThai: number) {
  if (trangThai === 429) return "Có quá nhiều lượt truy cập. Vui lòng đợi một phút rồi thử lại.";
  if (trangThai >= 500) return "Hệ thống đang bận hoặc bảo trì. Vui lòng thử lại sau ít phút.";
  return `Không tải được dữ liệu (mã lỗi ${trangThai}).`;
}

export async function layDanhMucThuTuc(
  cauHinh: CauHinh = cauHinhMacDinh,
  goi: typeof fetch = fetch,
): Promise<ThuTuc[]> {
  if (cauHinh.duLieuGia) {
    const { default: duLieu } = await import("@/du-lieu-gia/thu-tuc.json");
    return duLieu as ThuTuc[];
  }
  let res: Response;
  try {
    res = await goi(cauHinh.gatewayUrl + DUONG_DAN_DANH_MUC, {
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new LoiApi("Không kết nối được tới máy chủ. Vui lòng kiểm tra mạng rồi thử lại.", null);
  }
  if (!res.ok) throw new LoiApi(thongDiepLoi(res.status), res.status);
  return (await res.json()) as ThuTuc[];
}
