// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Trợ lý thủ tục hành chính (#91), gọi dịch vụ tro-ly qua APISIX, không cần đăng nhập:
//   GET  /tro-ly/thong-tin   chế độ đang chạy (có mô hình ngôn ngữ hay chỉ tìm kiếm)
//   POST /tro-ly/hoi         {cau_hoi, ma_thu_tuc?} → câu trả lời có trích dẫn [n] + danh sách nguồn
// Câu trả lời chỉ dựa trên nguồn; dịch vụ đã bỏ trích dẫn không có thật, web chỉ việc nối [n] với nguồn n.
import { LoiApi } from "./api";
import { cauHinh as cauHinhMacDinh, type CauHinh } from "./cau-hinh";
import { goiGateway } from "./goi-api";

export const TOI_DA_CAU_HOI = 500;

export interface ThongTinTroLy {
  che_do: "ollama" | "openai-compatible" | "tat" | "gia-lap";
  co_mo_hinh_ngon_ngu: boolean;
  mo_hinh: string | null;
}

export interface NguonTroLy {
  so: number;
  id: string;
  ma_thu_tuc: string | null;
  tieu_de: string;
  trich: string;
  lien_ket: string | null;
  duoc_trich: boolean;
}

export interface TraLoiTroLy extends ThongTinTroLy {
  /** null: không sinh được câu trả lời (chế độ chỉ tìm kiếm, mô hình lỗi/bận) – xem thong_bao và nguon. */
  cau_tra_loi: string | null;
  thong_bao: string | null;
  /** true: mô hình không dẫn nguồn nên dịch vụ thay bằng câu trích nguyên văn nguồn [1]. */
  trich_tu_dong: boolean;
  nguon: NguonTroLy[];
}

const KHONG_CO_LOI = "Chế độ dữ liệu giả không có trợ lý. Chạy cổng với lõi (make up) để hỏi đáp.";

export function kiemCauHoi(cauHoi: string) {
  const q = cauHoi.trim();
  if (q.length < 2) return "Nhập câu hỏi về thủ tục, ví dụ: Đăng ký kết hôn cần giấy tờ gì?";
  if (q.length > TOI_DA_CAU_HOI) return `Câu hỏi tối đa ${TOI_DA_CAU_HOI} ký tự.`;
  return null;
}

export async function hoiTroLy(
  cauHoi: string,
  maThuTuc: string | null = null,
  cauHinh: CauHinh = cauHinhMacDinh,
  goi: typeof fetch = (...a) => fetch(...a),
) {
  if (cauHinh.duLieuGia) throw new LoiApi(KHONG_CO_LOI, null);
  return goiGateway<TraLoiTroLy>(cauHinh, goi, "/tro-ly/hoi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cau_hoi: cauHoi.trim(), ...(maThuTuc ? { ma_thu_tuc: maThuTuc } : {}) }),
  });
}

export async function thongTinTroLy(cauHinh: CauHinh = cauHinhMacDinh, goi: typeof fetch = (...a) => fetch(...a)) {
  if (cauHinh.duLieuGia) throw new LoiApi(KHONG_CO_LOI, null);
  return goiGateway<ThongTinTroLy>(cauHinh, goi, "/tro-ly/thong-tin", { method: "GET" });
}

export type PhanTraLoi = { loai: "chu"; noiDung: string } | { loai: "trich"; so: number };

/** Tách câu trả lời thành đoạn chữ và trích dẫn [n] (n có trong danh sách nguồn) để hiện thành liên kết. */
export function tachTrichDan(cauTraLoi: string, soNguon: number): PhanTraLoi[] {
  const ket: PhanTraLoi[] = [];
  let truoc = 0;
  for (const m of cauTraLoi.matchAll(/\[(\d{1,2})\]/g)) {
    const so = Number(m[1]);
    if (so < 1 || so > soNguon) continue;
    if (m.index > truoc) ket.push({ loai: "chu", noiDung: cauTraLoi.slice(truoc, m.index) });
    ket.push({ loai: "trich", so });
    truoc = m.index + m[0].length;
  }
  if (truoc < cauTraLoi.length) ket.push({ loai: "chu", noiDung: cauTraLoi.slice(truoc) });
  return ket;
}

/** Nhãn chế độ cho người dân: nói rõ khi chưa có mô hình ngôn ngữ. */
export function nhanCheDo(tt: ThongTinTroLy) {
  if (!tt.co_mo_hinh_ngon_ngu) return "Chế độ tìm kiếm: hiện các đoạn tài liệu liên quan nhất, chưa bật mô hình ngôn ngữ.";
  if (tt.che_do === "gia-lap") return "Chế độ thử nghiệm: câu trả lời trích nguyên văn từ tài liệu.";
  return `Câu trả lời do mô hình ngôn ngữ mã nguồn mở (${tt.mo_hinh ?? "không rõ"}) tóm tắt từ tài liệu thủ tục.`;
}
