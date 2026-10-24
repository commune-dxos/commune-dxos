// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Tra cứu tiến độ hồ sơ (#54), gọi lõi qua APISIX:
//   GET  /public/rpc/tra_cuu_ho_so?p_ma=&p_so_cuoi=   không đăng nhập: mã hồ sơ + 4 số cuối số điện thoại
//                                                       (migration 012), chỉ trạng thái và các mốc; sai → null
//   GET  /api/ho_so                                    hồ sơ của mình (RLS chỉ trả hồ sơ người gọi đã nộp)
//   GET  /api/lich_su_trang_thai?ho_so_id=eq.…         các mốc chuyển trạng thái, kèm lý do bổ sung/từ chối
//   GET  /workflow/ho-so/{id}/tien-do                  bước Flowable đang mở và các bước đã xong
//   GET  /files/ho-so/{id}/tep                         giấy tờ đã nộp (metadata)
//   GET  /workflow/tasks                               bước "bổ sung" giao cho người nộp (KS01)
//   POST /workflow/tasks/{id}/complete                 nộp lại sau khi bổ sung (mot-cua-api kiểm lại
//                                                       đủ thành phần như lúc nộp, Poka-yoke #59)
import { LoiApi } from "./api";
import { cauHinh as cauHinhMacDinh, type CauHinh } from "./cau-hinh";
import { goiGateway } from "./goi-api";
import type { JsonSchemaHoSo } from "./thanh-phan";

/** Kết quả tra cứu công khai: không có họ tên, số điện thoại, lý do. */
export interface KetQuaTraCuu {
  ma_ho_so: string;
  thu_tuc: { ma: string; ten: string };
  trang_thai: string;
  ngay_nhan: string;
  han_xu_ly: string | null;
  ngay_hoan_tat: string | null;
  /** ly_do chỉ có khi đọc bằng token người nộp (trang Hồ sơ của tôi), tra cứu công khai không trả. */
  lich_su: { trang_thai: string; luc: string; ly_do?: string | null }[];
}

export interface HoSoCuaToi {
  id: string;
  ma_ho_so: string;
  trang_thai: string;
  ngay_nhan: string;
  han_xu_ly: string | null;
  ngay_hoan_tat: string | null;
  ly_do: string | null;
  thu_tuc: { id: string; ma: string; ten: string; so_ngay_xu_ly: number; json_schema: JsonSchemaHoSo | null } | null;
}

export interface MocTrangThai {
  den_trang_thai: string;
  ly_do: string | null;
  luc: string;
}

export interface TepDaNop {
  id: string;
  thanh_phan_yeu_cau_id: string | null;
  ten_tep: string;
  loai_mime: string;
  kich_thuoc: number;
  ket_qua_quet: string | null;
  created_at: string;
}

export interface TienDoQuyTrinh {
  quyTrinh: {
    processInstanceId: string;
    ketThuc: string | null;
    buocDangMo: { id: string; buoc: string; ten: string }[];
    lichSu: { buoc: string; ten: string; batDau: string; ketThuc: string | null }[];
  }[];
}

interface TaskCuaToi {
  id: string;
  buoc: string;
  ten: string;
  hoSoId: string | null;
}

export const COT_HO_SO =
  "id,ma_ho_so,trang_thai,ngay_nhan,han_xu_ly,ngay_hoan_tat,ly_do,thu_tuc:thu_tuc_id(id,ma,ten,so_ngay_xu_ly,json_schema)";

/** Mã hồ sơ do CSDL cấp: HS + ngày nộp + số thứ tự (HS20261024-000123). Viết thường, thừa cách vẫn nhận. */
export function chuanHoaMa(ma: string) {
  return ma.trim().toUpperCase();
}

export function kiemNhapTraCuu(ma: string, soCuoi: string) {
  const loi: { ma?: string; soCuoi?: string } = {};
  if (!/^HS\d{8}-[0-9A-Z]{1,10}$/.test(chuanHoaMa(ma))) {
    loi.ma = "Nhập mã hồ sơ in trên biên nhận, ví dụ HS20261024-000123.";
  }
  if (!/^\d{4}$/.test(soCuoi.trim())) loi.soCuoi = "Nhập đúng 4 chữ số cuối của số điện thoại đã khai khi nộp.";
  return loi;
}

export async function traCuuCongKhai(
  ma: string,
  soCuoi: string,
  cauHinh: CauHinh = cauHinhMacDinh,
  goi: typeof fetch = (...a) => fetch(...a),
) {
  if (cauHinh.duLieuGia) {
    throw new LoiApi("Chế độ dữ liệu giả không tra cứu được hồ sơ. Chạy cổng với lõi (make up) để tra cứu.", null);
  }
  const q = new URLSearchParams({ p_ma: chuanHoaMa(ma), p_so_cuoi: soCuoi.trim() });
  return goiGateway<KetQuaTraCuu | null>(cauHinh, goi, `/public/rpc/tra_cuu_ho_so?${q}`, { method: "GET" });
}

/** Các lời gọi cần đăng nhập, bằng access token của công dân. */
export class ApiHoSoCongDan {
  constructor(
    private readonly token: string,
    private readonly cauHinh: CauHinh = cauHinhMacDinh,
    private readonly goi: typeof fetch = (...a) => fetch(...a),
  ) {}

  private lay<T>(duong: string) {
    return goiGateway<T>(this.cauHinh, this.goi, duong, { method: "GET", token: this.token });
  }

  danhSach() {
    return this.lay<HoSoCuaToi[]>(`/api/ho_so?select=${COT_HO_SO}&order=ngay_nhan.desc`);
  }

  async hoSo(id: string) {
    const ds = await this.lay<HoSoCuaToi[]>(`/api/ho_so?id=eq.${encodeURIComponent(id)}&select=${COT_HO_SO}`);
    return ds[0] ?? null;
  }

  lichSu(id: string) {
    return this.lay<MocTrangThai[]>(
      `/api/lich_su_trang_thai?ho_so_id=eq.${encodeURIComponent(id)}&select=den_trang_thai,ly_do,luc&order=id`,
    );
  }

  tienDo(id: string) {
    return this.lay<TienDoQuyTrinh>(`/workflow/ho-so/${encodeURIComponent(id)}/tien-do`);
  }

  tep(id: string) {
    return this.lay<TepDaNop[]>(`/files/ho-so/${encodeURIComponent(id)}/tep`);
  }

  /** Bước "bổ sung" đang chờ người nộp của hồ sơ này; null nếu không có. */
  async taskBoSung(hoSoId: string) {
    const ds = await this.lay<TaskCuaToi[]>("/workflow/tasks");
    return ds.find((t) => t.hoSoId === hoSoId && t.buoc === "bo_sung") ?? null;
  }

  nopLai(taskId: string, ghiChu: string) {
    const bien = ghiChu.trim() ? { ghiChu: ghiChu.trim() } : {};
    return goiGateway<{ trangThai: string | null }>(
      this.cauHinh,
      this.goi,
      `/workflow/tasks/${encodeURIComponent(taskId)}/complete`,
      {
        method: "POST",
        token: this.token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bien }),
      },
    );
  }
}
