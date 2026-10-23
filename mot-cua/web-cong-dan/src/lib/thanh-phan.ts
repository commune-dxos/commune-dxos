// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Đọc thành phần hồ sơ từ thanh-phan-ho-so.schema.json của gói thủ tục (docs/thu-tuc.md) và kiểm
// Poka-yoke phía trình duyệt: thiếu thành phần bắt buộc thì chưa cho sang bước sau. Máy chủ vẫn
// kiểm lại bằng chính schema này trước khi khởi tạo quy trình (#59).

/** Tập con JSON Schema 2020-12 mà các gói thu-tuc/<goi>/ dùng cho thành phần hồ sơ. */
export interface JsonSchemaHoSo {
  title?: string;
  description?: string;
  properties?: {
    thanh_phan?: {
      required?: string[];
      properties?: Record<string, { title?: string; description?: string; minItems?: number } | undefined>;
    };
  };
}

export interface ThanhPhan {
  /** Khóa trong schema, vd `giay_chung_sinh`. */
  ma: string;
  ten: string;
  moTa: string | null;
  batBuoc: boolean;
  /** Số tệp tối thiểu (minItems), 1 nếu bắt buộc mà schema không ghi. */
  toiThieu: number;
}

export function docThanhPhan(schema: JsonSchemaHoSo | null | undefined): ThanhPhan[] {
  const tp = schema?.properties?.thanh_phan;
  if (!tp?.properties) return [];
  const batBuoc = new Set(tp.required ?? []);
  return Object.entries(tp.properties).flatMap(([ma, p]) =>
    p
      ? [{
          ma,
          ten: p.title ?? ma,
          moTa: p.description ?? null,
          batBuoc: batBuoc.has(ma),
          toiThieu: Math.max(p.minItems ?? 0, batBuoc.has(ma) ? 1 : 0),
        }]
      : [],
  );
}

/** Lỗi theo từng thành phần: `{ ma: câu báo lỗi }`, rỗng = đủ hồ sơ. */
export function kiemThanhPhan(ds: ThanhPhan[], tep: Record<string, File[] | undefined>) {
  const loi: Record<string, string> = {};
  for (const tp of ds) {
    const co = tep[tp.ma]?.length ?? 0;
    if (co < tp.toiThieu) loi[tp.ma] = `Chưa tải ${tp.ten.charAt(0).toLowerCase()}${tp.ten.slice(1)}`;
  }
  return loi;
}
