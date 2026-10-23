// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Cổng cán bộ gọi lõi qua APISIX bằng access token của cán bộ/lãnh đạo (client mot_cua_can_bo):
//   GET  /workflow/tasks                    task Flowable được giao cho mình hoặc thuộc nhóm của mình
//                                           (lĩnh vực phụ trách; lãnh đạo: nhóm lanh_dao)
//   GET  /api/ho_so?id=in.(…)               hồ sơ của các task, kèm thủ tục và biến từng bước (RLS:
//                                           cán bộ chỉ thấy lĩnh vực phụ trách, lãnh đạo thấy tất cả)
//   GET  /api/can_bo?sub=eq.…               họ tên, chức vụ, lĩnh vực của người đăng nhập
//   GET  /api/thanh_phan_yeu_cau            giấy tờ thủ tục yêu cầu
//   GET  /files/ho-so/{id}/tep              tệp đã nộp (metadata, theo RLS)
//   GET  /files/tep/{id}?ttl=…              link GET ký sẵn ngắn hạn (/files/s3/…), mot-cua-api ghi nhật ký
//   POST /files/ho-so/{id}/giay-to/{loai}   biên nhận / thông báo kết quả PDF có ký số (#77)
//   GET  /workflow/ho-so/{id}/tien-do       bước đang mở và lịch sử các bước
//   POST /workflow/tasks/{id}/complete      nhận + hoàn thành bước với biến khai báo cho bước đó
// Không gọi thẳng PostgREST, Flowable hay Garage; không cầm mật khẩu hay khóa nào.
import { cauHinh as cauHinhMacDinh, type CauHinh } from "@/lib/cau-hinh";
import { phatHanhGiayTo, type LoaiGiayTo } from "@/lib/giay-to";
import { goiGateway } from "@/lib/goi-api";
import type { BienGui, BienTheoBuoc } from "./form-buoc";

export interface Task {
  id: string;
  /** taskDefinitionKey (id userTask trong BPMN). */
  buoc: string;
  ten: string;
  /** sub người đã nhận; null = chưa ai nhận (task của nhóm). */
  nguoiNhan: string | null;
  taoLuc: string;
  processInstanceId: string;
  hoSoId: string | null;
  maHoSo: string | null;
  hanXuLyLuc: string | null;
  quaHan: boolean;
}

export interface HoSoCanBo {
  id: string;
  ma_ho_so: string;
  trang_thai: string;
  han_xu_ly: string | null;
  ho_ten_nguoi_nop: string;
  so_dien_thoai: string | null;
  ngay_nhan: string;
  thu_tuc: {
    id: string;
    ma: string;
    ten: string;
    so_ngay_xu_ly: number;
    bien_theo_buoc: BienTheoBuoc | null;
    linh_vuc: { ma: string; ten: string } | null;
  } | null;
}

export interface CanBo {
  ho_ten: string;
  chuc_vu: string;
  linh_vuc: { ma: string; ten: string }[];
}

export interface ThanhPhanYeuCau {
  id: string;
  ma: string;
  ten: string;
  bat_buoc: boolean;
  so_luong: number;
}

export interface TepHoSo {
  id: string;
  thanh_phan_yeu_cau_id: string | null;
  ten_tep: string;
  loai_mime: string;
  kich_thuoc: number;
  ket_qua_quet: string | null;
  created_at: string;
}

export interface LinkTep {
  link: string;
  hetHanLuc: string;
}

export interface BuocLichSu {
  buoc: string;
  ten: string;
  batDau: string;
  ketThuc: string | null;
}

export interface TienDo {
  hoSo: { id: string; ma_ho_so: string; trang_thai: string; han_xu_ly: string | null };
  quyTrinh: {
    processInstanceId: string;
    quyTrinh: string;
    batDau: string;
    ketThuc: string | null;
    diemKetThuc: string | null;
    buocDangMo: { id: string; buoc: string; ten: string }[];
    lichSu: BuocLichSu[];
  }[];
}

export interface KetQuaHoanThanh {
  id: string;
  buoc: string;
  buocDangMo: { id: string; buoc: string; ten: string }[];
}

const COT_HO_SO =
  "id,ma_ho_so,trang_thai,han_xu_ly,ho_ten_nguoi_nop,so_dien_thoai,ngay_nhan," +
  "thu_tuc:thu_tuc_id(id,ma,ten,so_ngay_xu_ly,bien_theo_buoc,linh_vuc:linh_vuc_id(ma,ten))";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ApiCanBo {
  constructor(
    private readonly token: string,
    private readonly cauHinh: CauHinh = cauHinhMacDinh,
    private readonly goi: typeof fetch = (...a) => fetch(...a),
  ) {}

  private lay<T>(duong: string) {
    return goiGateway<T>(this.cauHinh, this.goi, duong, { method: "GET", token: this.token });
  }

  layTask() {
    return this.lay<Task[]>("/workflow/tasks");
  }

  /** Hồ sơ theo id; id RLS không cho xem thì không có trong kết quả. */
  async layHoSo(ids: string[]): Promise<HoSoCanBo[]> {
    const hopLe = [...new Set(ids)].filter((id) => UUID.test(id));
    if (hopLe.length === 0) return [];
    return this.lay<HoSoCanBo[]>(`/api/ho_so?id=in.(${hopLe.join(",")})&select=${COT_HO_SO}`);
  }

  async layMotHoSo(id: string): Promise<HoSoCanBo | null> {
    return (await this.layHoSo([id]))[0] ?? null;
  }

  async layCanBo(sub: string): Promise<CanBo | null> {
    const rows = await this.lay<CanBo[]>(
      `/api/can_bo?sub=eq.${encodeURIComponent(sub)}&select=ho_ten,chuc_vu,linh_vuc(ma,ten)`,
    );
    return rows[0] ?? null;
  }

  layThanhPhanYeuCau(thuTucId: string) {
    return this.lay<ThanhPhanYeuCau[]>(
      `/api/thanh_phan_yeu_cau?thu_tuc_id=eq.${encodeURIComponent(thuTucId)}&select=id,ma,ten,bat_buoc,so_luong&order=thu_tu`,
    );
  }

  layTep(hoSoId: string) {
    return this.lay<TepHoSo[]>(`/files/ho-so/${encodeURIComponent(hoSoId)}/tep`);
  }

  layLinkTep(tepId: string) {
    return this.lay<LinkTep>(`/files/tep/${encodeURIComponent(tepId)}`);
  }

  phatHanhGiayTo(hoSoId: string, loai: LoaiGiayTo) {
    return phatHanhGiayTo(this.token, hoSoId, loai, this.cauHinh, this.goi);
  }

  layTienDo(hoSoId: string) {
    return this.lay<TienDo>(`/workflow/ho-so/${encodeURIComponent(hoSoId)}/tien-do`);
  }

  hoanThanh(taskId: string, bien: BienGui) {
    return goiGateway<KetQuaHoanThanh>(this.cauHinh, this.goi, `/workflow/tasks/${encodeURIComponent(taskId)}/complete`, {
      method: "POST",
      token: this.token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bien }),
    });
  }
}
