// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Đọc thành phần hồ sơ từ thanh-phan-ho-so.schema.json của gói thủ tục (docs/thu-tuc.md) và kiểm
// Poka-yoke phía trình duyệt bằng validator JSON Schema 2020-12 (@cfworker/json-schema, MIT) với
// đúng schema đó: thiếu thành phần bắt buộc thì chưa cho sang bước sau và không gửi request nào.
// Máy chủ kiểm lại bằng chính schema này trước khi khởi tạo quy trình (#59, mot-cua/backend/poka_yoke.py).
// Không dùng Ajv: Ajv biên dịch schema bằng new Function, bị CSP script-src 'self' của cổng chặn.
import { Validator, type Schema } from "@cfworker/json-schema";

/** Tập con JSON Schema 2020-12 mà các gói thu-tuc/<goi>/ dùng cho thành phần hồ sơ. */
export interface JsonSchemaHoSo {
  title?: string;
  description?: string;
  properties?: {
    thanh_phan?: {
      required?: string[];
      properties?: Record<string, { title?: string; description?: string; minItems?: number; maxItems?: number } | undefined>;
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

const BO_KIEM = new WeakMap<object, Validator>();

function boKiem(schema: JsonSchemaHoSo) {
  let v = BO_KIEM.get(schema);
  if (!v) {
    v = new Validator(schema as Schema, "2020-12", false);
    BO_KIEM.set(schema, v);
  }
  return v;
}

/** id giữ chỗ (UUID hợp lệ) cho tệp đã chọn mà chưa tải: lúc nộp, máy chủ dựng tài liệu bằng id thật. */
function idGiuCho(i: number) {
  return `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
}

/** Tài liệu cùng dạng máy chủ kiểm: {"thanh_phan": {"<mã>": ["<id tệp>", …]}}, bỏ thành phần chưa có tệp. */
export function taiLieuHoSo(tep: Record<string, File[] | undefined>) {
  let i = 0;
  const thanhPhan: Record<string, string[]> = {};
  for (const [ma, ds] of Object.entries(tep)) {
    if (ds?.length) thanhPhan[ma] = ds.map(() => idGiuCho(++i));
  }
  return { thanh_phan: thanhPhan };
}

const thuong = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Lỗi theo từng thành phần: `{ ma: câu báo lỗi }`, rỗng = đủ hồ sơ. Kiểm bằng chính JSON Schema của gói. */
export function kiemThanhPhan(schema: JsonSchemaHoSo | null | undefined, tep: Record<string, File[] | undefined>) {
  const loi: Record<string, string> = {};
  if (!schema) return loi;
  const doc = taiLieuHoSo(tep);
  const kq = boKiem(schema).validate(doc);
  if (kq.valid) return loi;
  const dn = schema.properties?.thanh_phan?.properties ?? {};
  const ten = (ma: string) => dn[ma]?.title ?? ma;
  const them = (ma: string, cau: string) => {
    loi[ma] ??= cau;
  };
  for (const e of kq.errors) {
    const duong = e.instanceLocation.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (duong[0] !== "thanh_phan") continue;
    const ma = duong[1];
    if (!ma && e.keyword === "required") {
      for (const m of schema.properties?.thanh_phan?.required ?? []) {
        if (!(m in doc.thanh_phan)) them(m, `Chưa tải ${thuong(ten(m))}`);
      }
    } else if (ma && duong.length === 2 && e.keyword === "minItems") {
      them(ma, `Cần ít nhất ${dn[ma]?.minItems ?? 1} tệp cho ${thuong(ten(ma))}`);
    } else if (ma && duong.length === 2 && e.keyword === "maxItems") {
      them(ma, `Chỉ được tải tối đa ${dn[ma]?.maxItems} tệp cho ${thuong(ten(ma))}`);
    } else if (ma && e.keyword !== "properties" && e.keyword !== "items") {
      them(ma, `Giấy tờ ${thuong(ten(ma))} không hợp lệ`);
    }
  }
  return loi;
}
