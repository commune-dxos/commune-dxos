// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Đọc giấy tờ bằng OCR + cán bộ xác nhận (#93), gọi mot-cua-api qua APISIX /files bằng token người dùng:
//   GET  /files/doc-giay-to/loai          loại giấy tờ đọc được (khóa = mã thành phần hồ sơ) và các trường
//   POST /files/doc-giay-to?loai=…        đọc thử ảnh để tự điền form nộp (không lưu gì)
//   POST /files/tep/{id}/khai             công dân gửi các trường đã xem/sửa cho tệp vừa tải lên
//   GET  /api/doc_giay_to?ho_so_id=eq.…   kết quả đọc của hồ sơ (RLS theo hồ sơ)
//   POST /files/tep/{id}/doc              cán bộ cho máy đọc lại tệp đã lưu
//   POST /files/tep/{id}/xac-nhan         cán bộ chốt giá trị sau khi so ảnh gốc (HITL)
// Máy chỉ đề xuất: giá trị dùng được là giá trị cán bộ xác nhận.
import { LoiApi } from "./api";
import { cauHinh as cauHinhMacDinh, type CauHinh } from "./cau-hinh";
import { goiGateway } from "./goi-api";

export interface TruongGiayTo {
  ma: string;
  nhan: string;
  kieu: string;
}

export interface LoaiGiayTo {
  ten: string;
  truong: TruongGiayTo[];
}

export interface TruongMay {
  gia_tri: string;
  tin_cay: number;
  can_kiem_tra: boolean;
  dong?: string;
}

export interface KetQuaDocThu {
  loai: string;
  truong: Record<string, TruongMay>;
}

export interface DocGiayTo {
  tep_id: string;
  ho_so_id: string;
  loai: string;
  trang_thai: "chua_doc" | "cho_xac_nhan" | "da_xac_nhan";
  truong_may: Record<string, TruongMay> | null;
  mo_hinh: Record<string, string> | null;
  doc_luc: string | null;
  loi_doc: string | null;
  truong_cong_dan: Record<string, string> | null;
  truong_xac_nhan: Record<string, string> | null;
  truong_da_sua: string[] | null;
  xac_nhan_boi_sub: string | null;
  xac_nhan_luc: string | null;
}

export const COT_DOC_GIAY_TO =
  "tep_id,ho_so_id,loai,trang_thai,truong_may,mo_hinh,doc_luc,loi_doc,truong_cong_dan,truong_xac_nhan,truong_da_sua," +
  "xac_nhan_boi_sub,xac_nhan_luc";

/** Ảnh đọc được: JPG, PNG (PDF nhiều trang cán bộ nhập tay). */
export function laAnh(f: File) {
  return /\.(jpe?g|png)$/i.test(f.name);
}

/** Giá trị gợi ý cho ô nhập: đã khai > máy đọc. */
export function goiYBanDau(loai: LoaiGiayTo, may: Record<string, TruongMay> | null, khai: Record<string, string> | null) {
  return Object.fromEntries(
    loai.truong.map((t) => [t.ma, khai?.[t.ma] ?? may?.[t.ma]?.gia_tri ?? ""]),
  ) as Record<string, string>;
}

/** Bỏ trường rỗng, gọn khoảng trắng (máy chủ kiểm lại). */
export function gonTruong(truong: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(truong)
      .map(([k, v]) => [k, v.replace(/\s+/g, " ").trim()] as const)
      .filter(([, v]) => v),
  );
}

export class ApiDocGiayTo {
  constructor(
    private readonly token: string,
    private readonly cauHinh: CauHinh = cauHinhMacDinh,
    private readonly goi: typeof fetch = (...a) => fetch(...a),
  ) {}

  private gui<T>(duong: string, init: RequestInit) {
    if (this.cauHinh.duLieuGia) {
      return Promise.reject(new LoiApi("Chế độ dữ liệu giả không đọc được giấy tờ. Chạy cổng với lõi (make up-ocr).", null));
    }
    return goiGateway<T>(this.cauHinh, this.goi, duong, { ...init, token: this.token });
  }

  layLoai() {
    return this.gui<Record<string, LoaiGiayTo>>("/files/doc-giay-to/loai", { method: "GET" });
  }

  docThu(loai: string, anh: File) {
    return this.gui<KetQuaDocThu>(`/files/doc-giay-to?loai=${encodeURIComponent(loai)}`, {
      method: "POST",
      headers: { "Content-Type": /\.png$/i.test(anh.name) ? "image/png" : "image/jpeg" },
      body: anh,
    });
  }

  khai(tepId: string, truong: Record<string, string>) {
    return this.json<DocGiayTo>(`/files/tep/${encodeURIComponent(tepId)}/khai`, { truong: gonTruong(truong) });
  }

  layKetQua(hoSoId: string) {
    return this.gui<DocGiayTo[]>(
      `/api/doc_giay_to?ho_so_id=eq.${encodeURIComponent(hoSoId)}&select=${COT_DOC_GIAY_TO}&order=tao_luc`,
      { method: "GET" },
    );
  }

  docLai(tepId: string) {
    return this.json<DocGiayTo>(`/files/tep/${encodeURIComponent(tepId)}/doc`, {});
  }

  xacNhan(tepId: string, truong: Record<string, string>) {
    return this.json<DocGiayTo>(`/files/tep/${encodeURIComponent(tepId)}/xac-nhan`, { truong: gonTruong(truong) });
  }

  private json<T>(duong: string, than: unknown) {
    return this.gui<T>(duong, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(than) });
  }
}
