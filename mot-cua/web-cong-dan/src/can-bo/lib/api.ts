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
//   GET  /files/wiki/tim?q=…                wiki văn bản nội bộ (#95): tìm theo quyền (Meilisearch + RLS)
//   POST /files/wiki, /files/wiki/{id}      văn thư, lãnh đạo thêm / sửa văn bản wiki
//   GET  /api/wiki_van_ban?id=eq.…          chi tiết văn bản; /api/wiki_van_ban_lich_su: phiên bản cũ (RLS)
//   GET  /api/linh_vuc                      danh sách lĩnh vực (chọn phạm vi văn bản)
//   GET  /api/lich_cong_tac?bat_dau=lt.…     lịch công tác trong một tuần (#117, RLS: cán bộ chỉ thấy lịch đã duyệt)
//   POST/PATCH /api/lich_cong_tac           văn thư soạn lịch dự kiến; lãnh đạo thêm, sửa, duyệt, hủy (RLS + trigger)
//   GET  /workflow/ho-so/{id}/tien-do       bước đang mở và lịch sử các bước
//   POST /workflow/tasks/{id}/complete      nhận + hoàn thành bước với biến khai báo cho bước đó
// Không gọi thẳng PostgREST, Flowable hay Garage; không cầm mật khẩu hay khóa nào.
import { cauHinh as cauHinhMacDinh, type CauHinh } from "@/lib/cau-hinh";
import { phatHanhGiayTo, type LoaiGiayTo } from "@/lib/giay-to";
import { LoiApi, thongDiepLoi } from "@/lib/api";
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

/** Wiki văn bản nội bộ (#95). */
export type LoaiWiki = "quy_che" | "huong_dan" | "quy_trinh" | "bieu_mau" | "thong_bao_noi_bo" | "khac";
export type PhamViWiki = "toan_xa" | "linh_vuc" | "lanh_dao";
export type TrangThaiWiki = "hieu_luc" | "het_hieu_luc";

export interface VanBanWikiTom {
  id: string;
  tieu_de: string;
  loai: LoaiWiki;
  so_ky_hieu: string | null;
  ngay_ban_hanh: string | null;
  tom_tat: string | null;
  pham_vi: PhamViWiki;
  linh_vuc_id: string | null;
  trang_thai: TrangThaiWiki;
  phien_ban: number;
  sua_luc: string;
}

export interface KetQuaWiki extends VanBanWikiTom {
  /** Tiêu đề và đoạn trích; đoạn khớp nằm giữa U+E000 và U+E001 (giao diện tự dựng <mark>). */
  tieu_de_danh_dau: string;
  trich_doan: string;
}

export interface TimWiki {
  ket_qua: KetQuaWiki[];
  tong: number;
  /** meilisearch; csdl khi chỉ mục không chạy (tìm dự phòng trong CSDL). */
  nguon: "meilisearch" | "csdl";
  q: string;
}

export interface VanBanWiki extends VanBanWikiTom {
  noi_dung: string;
  nguoi_tao_sub: string;
  nguoi_sua_sub: string;
  tao_luc: string;
  linh_vuc: { ma: string; ten: string } | null;
}

export interface PhienBanWiki {
  phien_ban: number;
  tieu_de: string;
  noi_dung: string;
  trang_thai: TrangThaiWiki;
  nguoi_sua_sub: string;
  sua_luc: string;
}

export interface LinhVuc {
  id: string;
  ma: string;
  ten: string;
}

export interface GhiWiki {
  tieu_de?: string;
  loai?: LoaiWiki;
  so_ky_hieu?: string | null;
  ngay_ban_hanh?: string | null;
  tom_tat?: string | null;
  noi_dung?: string;
  pham_vi?: PhamViWiki;
  linh_vuc_id?: string | null;
  trang_thai?: TrangThaiWiki;
}

/** Lịch công tác (#117). */
export type LoaiLich = "hop" | "tiep_dan" | "truc" | "cong_tac" | "khac";
export type TrangThaiLich = "du_kien" | "da_duyet" | "da_huy";

export interface LichCongTac {
  id: string;
  tieu_de: string;
  loai: LoaiLich;
  bat_dau: string;
  ket_thuc: string;
  dia_diem: string | null;
  chu_tri: string | null;
  thanh_phan: string | null;
  ghi_chu: string | null;
  trang_thai: TrangThaiLich;
  ly_do_huy: string | null;
  duyet_luc: string | null;
}

export interface GhiLich {
  tieu_de?: string;
  loai?: LoaiLich;
  bat_dau?: string;
  ket_thuc?: string;
  dia_diem?: string | null;
  chu_tri?: string | null;
  thanh_phan?: string | null;
  ghi_chu?: string | null;
  trang_thai?: TrangThaiLich;
  ly_do_huy?: string | null;
}

/** Lỗi ghi lịch qua PostgREST: trùng địa điểm (23P01) có câu tiếng Việt của trigger; lỗi khác dùng câu chung. */
export const LOI_LICH_KHONG_HOP_LE =
  "Lịch chưa hợp lệ: giờ kết thúc phải sau giờ bắt đầu (tối đa 7 ngày); hủy lịch phải ghi lý do; lịch đã hủy không sửa được.";

interface LoiPostgrest {
  code?: string;
  message?: string;
}

const COT_LICH =
  "id,tieu_de,loai,bat_dau,ket_thuc,dia_diem,chu_tri,thanh_phan,ghi_chu,trang_thai,ly_do_huy,duyet_luc";

export class ApiCanBo {
  constructor(
    readonly token: string,
    readonly cauHinh: CauHinh = cauHinhMacDinh,
    readonly goi: typeof fetch = (...a) => fetch(...a),
  ) {}

  private async lay<T>(duong: string): Promise<T> {
    try {
      return await goiGateway<T>(this.cauHinh, this.goi, duong, { method: "GET", token: this.token });
    } catch (e) {
      if (this.cauHinh.duLieuGia) {
        const gia = this.layDuLieuGia<T>(duong);
        if (gia !== undefined) return gia;
      }
      throw e;
    }
  }

  private layDuLieuGia<T>(duong: string): T | undefined {
    if (duong.startsWith("/workflow/tasks")) {
      return [
        {
          id: "33333333-3333-4333-8333-333333333333",
          buoc: "tiep_nhan",
          ten: "Tiếp nhận, kiểm tra thành phần hồ sơ",
          nguoiNhan: "00000000-0000-0000-0000-00000000b001",
          taoLuc: "2026-10-23T01:00:00.000Z",
          processInstanceId: "pi-01",
          hoSoId: "11111111-1111-4111-8111-111111111111",
          maHoSo: "HS20261023-000001",
          hanXuLyLuc: new Date(Date.now() + 86400000).toISOString(),
          quaHan: false,
        },
        {
          id: "44444444-4444-4444-8444-444444444444",
          buoc: "tham_dinh",
          ten: "Thẩm định hồ sơ khai sinh",
          nguoiNhan: null,
          taoLuc: "2026-10-24T02:00:00.000Z",
          processInstanceId: "pi-02",
          hoSoId: "22222222-2222-4222-8222-222222222222",
          maHoSo: "HS20261023-000002",
          hanXuLyLuc: new Date(Date.now() + 172800000).toISOString(),
          quaHan: false,
        },
      ] as unknown as T;
    }
    if (duong.startsWith("/api/ho_so")) {
      return [
        {
          id: "11111111-1111-4111-8111-111111111111",
          ma_ho_so: "HS20261023-000001",
          trang_thai: "moi",
          han_xu_ly: new Date(Date.now() + 86400000).toISOString().split("T")[0],
          ho_ten_nguoi_nop: "Nguyễn Văn Mẫu",
          so_dien_thoai: "0900000001",
          ngay_nhan: "2026-10-22T02:00:00Z",
          thu_tuc: {
            id: "tt-KS01",
            ma: "KS01",
            ten: "Đăng ký khai sinh",
            so_ngay_xu_ly: 1,
            bien_theo_buoc: {
              tiep_nhan: {
                hopLe: { kieu: "boolean", bat_buoc: true, ten: "Đủ thành phần hồ sơ?" },
                ghiChu: { kieu: "string", bat_buoc: false, ten: "Ghi chú" },
              },
            },
            linh_vuc: { ma: "ho_tich", ten: "Hộ tịch" },
          },
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          ma_ho_so: "HS20261023-000002",
          trang_thai: "dang_xu_ly",
          han_xu_ly: new Date(Date.now() + 172800000).toISOString().split("T")[0],
          ho_ten_nguoi_nop: "Lê Thị Thử",
          so_dien_thoai: "0900000002",
          ngay_nhan: "2026-10-23T03:00:00Z",
          thu_tuc: {
            id: "tt-KS01",
            ma: "KS01",
            ten: "Đăng ký khai sinh",
            so_ngay_xu_ly: 1,
            bien_theo_buoc: null,
            linh_vuc: { ma: "ho_tich", ten: "Hộ tịch" },
          },
        },
      ] as unknown as T;
    }
    if (duong.startsWith("/api/can_bo")) {
      return [
        {
          ho_ten: "Trần Thị Một Cửa",
          chuc_vu: "Cán bộ Bộ phận Một cửa",
          linh_vuc: [
            { ma: "ho_tich", ten: "Hộ tịch" },
            { ma: "chung_thuc", ten: "Chứng thực" },
          ],
        },
      ] as unknown as T;
    }
    if (duong.startsWith("/api/thong_bao")) {
      return [
        {
          id: "tb-01",
          ho_so_id: "11111111-1111-4111-8111-111111111111",
          loai: "sap_tre",
          moc: new Date(Date.now() + 86400000).toISOString(),
          tieu_de: "Hồ sơ HS20261023-000001 sắp tới hạn",
          noi_dung: "Đăng ký khai sinh của Nguyễn Văn Mẫu còn 1 ngày làm việc.",
          tao_luc: new Date(Date.now() - 3600000).toISOString(),
          da_doc_luc: null,
          thong_bao_kenh: [{ kenh: "email", trang_thai: "gia_lap" }],
        },
      ] as unknown as T;
    }
    if (duong.startsWith("/api/van_ban")) {
      return [
        {
          id: "vb-01",
          chieu: "den",
          trang_thai: "da_vao_so",
          nam: 2026,
          so: 108,
          ky_hieu: "108/UBND-VP",
          loai: "Công văn",
          ngay_van_ban: "2026-11-01",
          trich_yeu: "Về việc thực hiện dịch vụ công trực tuyến cấp xã",
          noi_gui: "UBND Huyện",
          noi_nhan: "UBND Xã",
          nguoi_ky: "Phạm Văn Đồng",
          ten_tep: "cv-108.pdf",
          kich_thuoc: 412000,
          sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          xac_minh_chu_ky: { coChuKy: true, hopLe: true, nguoiKy: "UBND Huyện", loi: null },
          ky_luc: "2026-11-01T08:00:00Z",
          created_at: "2026-11-01T08:30:00Z",
        },
        {
          id: "vb-02",
          chieu: "di",
          trang_thai: "da_ky",
          nam: 2026,
          so: 45,
          ky_hieu: "45/BC-UBND",
          loai: "Báo cáo",
          ngay_van_ban: "2026-11-05",
          trich_yeu: "Báo cáo tình hình xử lý hồ sơ một cửa tháng 10/2026",
          noi_gui: "UBND Xã",
          noi_nhan: "UBND Huyện",
          nguoi_ky: "Nguyễn Văn Lãnh Đạo",
          ten_tep: "bc-45.pdf",
          kich_thuoc: 285000,
          sha256: "b2c3d4e5",
          xac_minh_chu_ky: { coChuKy: true, hopLe: true, nguoiKy: "Chủ tịch UBND Xã", loi: null },
          ky_luc: "2026-11-05T10:00:00Z",
          created_at: "2026-11-05T09:30:00Z",
        },
      ] as unknown as T;
    }
    if (duong.startsWith("/api/lich_cong_tac")) {
      const nay = new Date();
      const sang = new Date(nay.getFullYear(), nay.getMonth(), nay.getDate(), 8, 0).toISOString();
      const trua = new Date(nay.getFullYear(), nay.getMonth(), nay.getDate(), 11, 30).toISOString();
      return [
        {
          id: "l-01",
          tieu_de: "Giao ban công tác cải cách hành chính xã",
          loai: "hop",
          bat_dau: sang,
          ket_thuc: trua,
          dia_diem: "Hội trường UBND xã",
          chu_tri: "Chủ tịch UBND xã",
          thanh_phan: "Ban Chỉ đạo Chuyển đổi số xã, Cán bộ Một cửa",
          ghi_chu: "Đánh giá tiến độ số hóa hồ sơ thủ tục",
          trang_thai: "da_duyet",
          ly_do_huy: null,
          duyet_luc: sang,
        },
      ] as unknown as T;
    }
    if (duong.startsWith("/files/wiki/tim") || duong.startsWith("/api/wiki_van_ban")) {
      return {
        q: "",
        tong: 1,
        nguon: "csdl",
        ket_qua: [
          {
            id: "w-01",
            tieu_de: "Hướng dẫn nghiệp vụ tiếp nhận và giải quyết hồ sơ một cửa",
            tieu_de_danh_dau: "Hướng dẫn nghiệp vụ tiếp nhận và giải quyết hồ sơ một cửa",
            loai: "huong_dan",
            so_ky_hieu: "HD-01/UBND",
            ngay_ban_hanh: "2026-09-01",
            tom_tat: "Quy trình kiểm tra hồ sơ, quét giấy tờ và cập nhật trạng thái trên hệ thống",
            trich_doan: "Cán bộ một cửa thực hiện kiểm tra đầy đủ thành phần hồ sơ theo Quyết định công bố...",
            pham_vi: "toan_xa",
            linh_vuc_id: null,
            trang_thai: "hieu_luc",
            phien_ban: 1,
            sua_luc: "2026-09-01T08:00:00Z",
          },
        ],
      } as unknown as T;
    }
    if (duong.startsWith("/api/linh_vuc")) {
      return [
        { id: "lv-01", ma: "ho_tich", ten: "Hộ tịch" },
        { id: "lv-02", ma: "chung_thuc", ten: "Chứng thực" },
      ] as unknown as T;
    }
    return undefined;
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

  timWiki(tham: { q?: string; loai?: LoaiWiki | ""; tatCa?: boolean }) {
    const q = new URLSearchParams({ q: tham.q ?? "" });
    if (tham.loai) q.set("loai", tham.loai);
    if (tham.tatCa) q.set("tat_ca", "1");
    return this.lay<TimWiki>(`/files/wiki/tim?${q.toString()}`);
  }

  async layVanBanWiki(id: string): Promise<VanBanWiki | null> {
    if (!UUID.test(id)) return null;
    const rows = await this.lay<VanBanWiki[]>(`/api/wiki_van_ban?id=eq.${id}&select=*,linh_vuc(ma,ten)`);
    return rows[0] ?? null;
  }

  layLichSuWiki(id: string) {
    return this.lay<PhienBanWiki[]>(
      `/api/wiki_van_ban_lich_su?van_ban_id=eq.${encodeURIComponent(id)}` +
        "&select=phien_ban,tieu_de,noi_dung,trang_thai,nguoi_sua_sub,sua_luc&order=phien_ban.desc",
    );
  }

  layLinhVuc() {
    return this.lay<LinhVuc[]>("/api/linh_vuc?select=id,ma,ten&order=ten");
  }

  ghiWiki(duLieu: GhiWiki, id?: string) {
    return goiGateway<VanBanWiki>(this.cauHinh, this.goi, id ? `/files/wiki/${encodeURIComponent(id)}` : "/files/wiki", {
      method: "POST",
      token: this.token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(duLieu),
    });
  }

  /** Lịch có giao với khoảng [tu, den) (ISO), sắp theo giờ bắt đầu. RLS quyết định thấy lịch dự kiến hay không. */
  layLich(tu: string, den: string) {
    const q = new URLSearchParams({ select: COT_LICH, bat_dau: `lt.${den}`, ket_thuc: `gt.${tu}`, order: "bat_dau,id" });
    return this.lay<LichCongTac[]>(`/api/lich_cong_tac?${q.toString()}`);
  }

  /** Thêm (không có id) hoặc sửa, duyệt, hủy (có id) một lịch; trả lịch sau khi CSDL ghi. */
  async ghiLich(duLieu: GhiLich, id?: string): Promise<LichCongTac> {
    if (id !== undefined && !UUID.test(id)) throw new LoiApi("Mã lịch không hợp lệ.", null);
    const duong = id ? `/api/lich_cong_tac?id=eq.${id}&select=${COT_LICH}` : `/api/lich_cong_tac?select=${COT_LICH}`;
    let res: Response;
    try {
      res = await this.goi(this.cauHinh.gatewayUrl + duong, {
        method: id ? "PATCH" : "POST",
        headers: {
          Accept: "application/vnd.pgrst.object+json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
          Prefer: "return=representation",
        },
        body: JSON.stringify(duLieu),
      });
    } catch {
      throw new LoiApi("Không kết nối được tới máy chủ. Vui lòng kiểm tra mạng rồi thử lại.", null);
    }
    const than = await res.text();
    let json: LoiPostgrest | null;
    try {
      json = than ? (JSON.parse(than) as LoiPostgrest) : null;
    } catch {
      json = null;
    }
    if (res.ok && json) return json as unknown as LichCongTac;
    if (res.status === 401) throw new LoiApi("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", 401);
    if (json?.code === "23P01" && json.message) throw new LoiApi(json.message, res.status);
    if (json?.code === "23514" || json?.code === "22007" || json?.code === "22008") throw new LoiApi(LOI_LICH_KHONG_HOP_LE, res.status);
    if (res.status === 403 || json?.code === "PGRST116") {
      throw new LoiApi("Bạn không được thay đổi lịch này (có thể lịch đã được duyệt hoặc đã hủy).", res.status);
    }
    throw new LoiApi(thongDiepLoi(res.status), res.status);
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
