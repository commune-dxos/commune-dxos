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
//   GET  /api/van_ban?chieu=eq.…            sổ văn bản đến/đi (#78, RLS: cán bộ, lãnh đạo, văn thư)
//   POST /files/van-ban/den?…               văn thư vào sổ văn bản đến (body = tệp quét)
//   POST /files/van-ban/di                  văn thư soạn dự thảo văn bản đi
//   POST /files/van-ban/{id}/ky             lãnh đạo ký ban hành (cấp số, PDF ký PAdES)
//   GET  /files/van-ban/{id}                link tải ngắn hạn
//   POST /files/xac-minh                    xác minh chữ ký số một PDF
//   GET  /api/thong_bao                     thông báo sắp trễ hạn của mình (#56, RLS); PATCH đánh dấu đã đọc
//   GET  /workflow/thong-bao/luong          luồng SSE cho chuông (lib/luong-thong-bao.ts)
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

export type ChieuVanBan = "den" | "di";

export interface VanBan {
  id: string;
  chieu: ChieuVanBan;
  trang_thai: "da_vao_so" | "du_thao" | "da_ky";
  nam: number | null;
  so: number | null;
  ky_hieu: string | null;
  loai: string;
  ngay_van_ban: string | null;
  trich_yeu: string;
  noi_gui: string | null;
  noi_nhan: string | null;
  nguoi_ky: string | null;
  ten_tep: string | null;
  kich_thuoc: number | null;
  sha256: string | null;
  xac_minh_chu_ky: { coChuKy?: boolean; hopLe?: boolean; nguoiKy?: string | null; loi?: string | null } | null;
  ky_luc: string | null;
  created_at: string;
}

export interface VanBanDen {
  loai: string;
  ky_hieu: string;
  ngay_van_ban: string;
  trich_yeu: string;
  noi_gui: string;
  nguoi_ky?: string;
}

export interface DuThaoDi {
  loai: string;
  trich_yeu: string;
  noi_nhan: string;
  noi_dung: string;
}

export interface KetQuaXacMinh {
  hopLe: boolean;
  coChuKy: boolean;
  toanVen?: boolean;
  tinCay?: boolean;
  nguoiKy?: string | null;
  kyLuc?: string | null;
  loi?: string;
  sha256: string;
  phatHanh: { loai: string; kyHieu?: string; maHoSo?: string; kyLuc: string } | null;
}

/** Loại văn bản đi mot-cua-api nhận (khớp KY_HIEU_LOAI trong main.py). */
export const LOAI_VAN_BAN_DI = ["Thông báo", "Công văn", "Quyết định", "Kế hoạch", "Báo cáo", "Tờ trình", "Giấy mời",
  "Biên bản"] as const;

const COT_HO_SO =
  "id,ma_ho_so,trang_thai,han_xu_ly,ho_ten_nguoi_nop,so_dien_thoai,ngay_nhan," +
  "thu_tuc:thu_tuc_id(id,ma,ten,so_ngay_xu_ly,bien_theo_buoc,linh_vuc:linh_vuc_id(ma,ten))";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Thông báo tới cán bộ (#56, mot_cua.thong_bao): consumer RabbitMQ ghi khi hồ sơ sắp trễ hạn. */
export interface ThongBao {
  id: string;
  ho_so_id: string;
  loai: "sap_tre_han";
  /** Hạn xử lý mà thông báo nói tới (YYYY-MM-DD). */
  moc: string;
  tieu_de: string;
  noi_dung: string;
  tao_luc: string;
  da_doc_luc: string | null;
  /** Kênh ngoài đã gửi ở chế độ giả lập. */
  thong_bao_kenh: { kenh: "email" | "sms"; trang_thai: "gia_lap" }[];
}

export class ApiCanBo {
  constructor(
    readonly token: string,
    readonly cauHinh: CauHinh = cauHinhMacDinh,
    readonly goi: typeof fetch = (...a) => fetch(...a),
  ) {}

  private lay<T>(duong: string) {
    return goiGateway<T>(this.cauHinh, this.goi, duong, { method: "GET", token: this.token });
  }

  layThongBao() {
    return this.lay<ThongBao[]>(
      "/api/thong_bao?select=id,ho_so_id,loai,moc,tieu_de,noi_dung,tao_luc,da_doc_luc,thong_bao_kenh(kenh,trang_thai)" +
        "&order=tao_luc.desc,id&limit=100",
    );
  }

  /** Đánh dấu đã đọc; CSDL tự đặt giờ đọc (trigger), thông báo đã đọc giữ nguyên giờ cũ. */
  async danhDauDaDoc(ids: string[]) {
    const hopLe = [...new Set(ids)].filter((id) => UUID.test(id));
    if (hopLe.length === 0) return;
    await goiGateway(this.cauHinh, this.goi, `/api/thong_bao?id=in.(${hopLe.join(",")})&da_doc_luc=is.null`, {
      method: "PATCH",
      token: this.token,
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ da_doc_luc: new Date().toISOString() }),
    });
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

  laySoVanBan(chieu: ChieuVanBan) {
    return this.lay<VanBan[]>(
      `/api/van_ban?chieu=eq.${chieu}&select=*&order=nam.desc.nullsfirst,so.desc.nullsfirst,created_at.desc`,
    );
  }

  vaoSoDen(tep: File, meta: VanBanDen) {
    const q = new URLSearchParams({ ten: tep.name, ...meta });
    if (!meta.nguoi_ky) q.delete("nguoi_ky");
    return goiGateway<VanBan>(this.cauHinh, this.goi, `/files/van-ban/den?${q.toString()}`, {
      method: "POST",
      token: this.token,
      headers: { "Content-Type": tep.type || "application/octet-stream" },
      body: tep,
    });
  }

  duThaoDi(duLieu: DuThaoDi) {
    return goiGateway<VanBan>(this.cauHinh, this.goi, "/files/van-ban/di", {
      method: "POST",
      token: this.token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(duLieu),
    });
  }

  kyVanBan(id: string) {
    return goiGateway<VanBan & LinkTep>(this.cauHinh, this.goi, `/files/van-ban/${encodeURIComponent(id)}/ky`, {
      method: "POST",
      token: this.token,
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  }

  layLinkVanBan(id: string) {
    return this.lay<VanBan & LinkTep>(`/files/van-ban/${encodeURIComponent(id)}`);
  }

  xacMinh(tep: File) {
    return goiGateway<KetQuaXacMinh>(this.cauHinh, this.goi, "/files/xac-minh", {
      method: "POST",
      token: this.token,
      headers: { "Content-Type": "application/pdf" },
      body: tep,
    });
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
