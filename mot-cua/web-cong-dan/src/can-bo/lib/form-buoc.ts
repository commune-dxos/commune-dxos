// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Form xử lý một bước, sinh từ biến được phép của bước đó: cột thu_tuc.bien_theo_buoc mà bộ nạp gói
// đọc từ flowable:formProperty trong quy-trinh.bpmn20.xml của gói ({bước: {biến: {kieu, bat_buoc,
// ten}}}). Web không biết thủ tục nào: KS01 ra "Đủ thành phần hồ sơ?" (tiếp nhận / yêu cầu bổ sung),
// "Đạt yêu cầu?" (chuyển lãnh đạo / từ chối), "Phê duyệt?"; CT01 ra "Số bản đã chứng thực"…
// POST /workflow/tasks/{id}/complete nhận đúng các biến này, kiểm lại kiểu và biến bắt buộc (400).

export type KieuBien = "boolean" | "string" | "long";

export interface KhaiBaoBien {
  kieu: KieuBien | string;
  bat_buoc: boolean;
  /** Nhãn (thuộc tính name của formProperty). Gói nạp trước #55 không có: dùng mã biến. */
  ten?: string;
}

export type BienTheoBuoc = Record<string, Record<string, KhaiBaoBien>>;

export interface TruongForm {
  ma: string;
  nhan: string;
  kieu: KieuBien;
  batBuoc: boolean;
}

/** Giá trị đang nhập: boolean là "co" | "khong" | "", số và chữ giữ nguyên chuỗi. */
export type GiaTriForm = Record<string, string>;
export type BienGui = Record<string, boolean | number | string>;

export const DO_DAI_TOI_DA = 2000;
const THU_TU_KIEU: Record<KieuBien, number> = { boolean: 0, long: 1, string: 2 };

function laKieu(k: string): k is KieuBien {
  return k === "boolean" || k === "string" || k === "long";
}

/**
 * Trường của bước, thứ tự cố định (jsonb không giữ thứ tự khai báo): bắt buộc trước, rồi
 * có/không → số → chữ. null = bước không khai trong gói (API sẽ trả 403, không xử lý qua cổng).
 */
export function truongCuaBuoc(bienTheoBuoc: BienTheoBuoc | null | undefined, buoc: string): TruongForm[] | null {
  const khai = bienTheoBuoc?.[buoc];
  if (!khai) return null;
  return Object.entries(khai)
    .filter(([, kb]) => laKieu(kb.kieu))
    .map(([ma, kb]) => ({ ma, nhan: kb.ten?.trim() || ma, kieu: kb.kieu as KieuBien, batBuoc: kb.bat_buoc === true }))
    .sort((a, b) => Number(b.batBuoc) - Number(a.batBuoc) || THU_TU_KIEU[a.kieu] - THU_TU_KIEU[b.kieu] || a.ma.localeCompare(b.ma));
}

export function giaTriBanDau(truong: TruongForm[]): GiaTriForm {
  return Object.fromEntries(truong.map((t) => [t.ma, ""]));
}

/** Lỗi theo mã biến (câu tiếng Việt); {} = hợp lệ. */
export function kiemForm(truong: TruongForm[], gt: GiaTriForm): Record<string, string> {
  const loi: Record<string, string> = {};
  for (const t of truong) {
    const v = (gt[t.ma] ?? "").trim();
    if (t.kieu === "boolean") {
      if (v === "" && t.batBuoc) loi[t.ma] = `Chọn Có hoặc Không cho “${t.nhan}”`;
      else if (v !== "" && v !== "co" && v !== "khong") loi[t.ma] = `Chọn Có hoặc Không cho “${t.nhan}”`;
    } else if (t.kieu === "long") {
      if (v === "") {
        if (t.batBuoc) loi[t.ma] = `Nhập “${t.nhan}”`;
      } else if (!/^\d{1,9}$/.test(v)) {
        loi[t.ma] = `“${t.nhan}” phải là số nguyên không âm`;
      }
    } else if (v === "" && t.batBuoc) {
      loi[t.ma] = `Nhập “${t.nhan}”`;
    } else if (v.length > DO_DAI_TOI_DA) {
      loi[t.ma] = `“${t.nhan}” tối đa ${DO_DAI_TOI_DA} ký tự`;
    }
  }
  return loi;
}

/** Biến gửi lên API, đúng kiểu JSON; trường không bắt buộc để trống thì không gửi. Gọi sau kiemForm. */
export function taoBien(truong: TruongForm[], gt: GiaTriForm): BienGui {
  const bien: BienGui = {};
  for (const t of truong) {
    const v = (gt[t.ma] ?? "").trim();
    if (v === "") continue;
    bien[t.ma] = t.kieu === "boolean" ? v === "co" : t.kieu === "long" ? Number.parseInt(v, 10) : v;
  }
  return bien;
}

/** Câu tóm tắt kết quả cho hộp xác nhận: "Đủ thành phần hồ sơ?: Không · Ghi chú: thiếu tờ khai". */
export function tomTat(truong: TruongForm[], bien: BienGui): string {
  return truong
    .filter((t) => t.ma in bien)
    .map((t) => `${t.nhan.replace(/[?:]\s*$/, "")}: ${typeof bien[t.ma] === "boolean" ? (bien[t.ma] ? "Có" : "Không") : String(bien[t.ma])}`)
    .join(" · ");
}
