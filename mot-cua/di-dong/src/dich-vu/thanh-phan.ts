// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Thành phần hồ sơ đọc từ thanh-phan-ho-so.schema.json của gói thủ tục (docs/thu-tuc.md). Poka-yoke phía
// app: kiểm ảnh đã chọn theo đúng JSON Schema 2020-12 của gói (@cfworker/json-schema, như cổng công dân);
// thiếu thành phần bắt buộc thì chưa gửi request nào. Máy chủ kiểm lại bằng chính schema này trước khi
// khởi tạo quy trình (mot-cua/backend/poka_yoke.py).
import { Validator, type Schema } from '@cfworker/json-schema';

/** Tập con JSON Schema 2020-12 mà các gói thu-tuc/<goi>/ dùng cho thành phần hồ sơ. */
export interface JsonSchemaHoSo {
  title?: string;
  description?: string;
  properties?: {
    thanh_phan?: {
      required?: string[];
      properties?: Record<
        string,
        { title?: string; description?: string; minItems?: number; maxItems?: number } | undefined
      >;
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
  toiDa: number | null;
}

export function docThanhPhan(schema: JsonSchemaHoSo | null | undefined): ThanhPhan[] {
  const tp = schema?.properties?.thanh_phan;
  if (!tp?.properties) return [];
  const batBuoc = new Set(tp.required ?? []);
  const kq: ThanhPhan[] = [];
  for (const [ma, p] of Object.entries(tp.properties)) {
    if (!p) continue;
    kq.push({
      ma,
      ten: p.title ?? ma,
      moTa: p.description ?? null,
      batBuoc: batBuoc.has(ma),
      toiThieu: Math.max(p.minItems ?? 0, batBuoc.has(ma) ? 1 : 0),
      toiDa: p.maxItems ?? null,
    });
  }
  return kq;
}

const BO_KIEM = new WeakMap<object, Validator>();

function boKiem(schema: JsonSchemaHoSo) {
  let v = BO_KIEM.get(schema);
  if (!v) {
    v = new Validator(schema as Schema, '2020-12', false);
    BO_KIEM.set(schema, v);
  }
  return v;
}

/** Tài liệu cùng dạng máy chủ kiểm: {"thanh_phan": {"<mã>": ["<id>", …]}}; id giữ chỗ là UUID hợp lệ. */
export function taiLieuHoSo(soTep: Record<string, number>) {
  let i = 0;
  const thanhPhan: Record<string, string[]> = {};
  for (const [ma, n] of Object.entries(soTep)) {
    if (n > 0) {
      thanhPhan[ma] = Array.from({ length: n }, () => `00000000-0000-4000-8000-${String(++i).padStart(12, '0')}`);
    }
  }
  return { thanh_phan: thanhPhan };
}

const thuong = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Lỗi theo từng thành phần `{ ma: câu báo }`; rỗng = đủ giấy tờ. `soTep`: số ảnh đã chọn cho từng mã. */
export function kiemThanhPhan(schema: JsonSchemaHoSo | null | undefined, soTep: Record<string, number>) {
  const loi: Record<string, string> = {};
  if (!schema) return loi;
  const doc = taiLieuHoSo(soTep);
  const kq = boKiem(schema).validate(doc);
  if (kq.valid) return loi;
  const dn = schema.properties?.thanh_phan?.properties ?? {};
  const ten = (ma: string) => thuong(dn[ma]?.title ?? ma);
  const them = (ma: string, cau: string) => {
    loi[ma] ??= cau;
  };
  for (const e of kq.errors) {
    const duong = e.instanceLocation.replace(/^#\/?/, '').split('/').filter(Boolean);
    if (duong[0] !== 'thanh_phan') continue;
    const ma = duong[1];
    if (!ma && e.keyword === 'required') {
      const batBuoc: string[] = schema.properties?.thanh_phan?.required ?? [];
      for (const m of batBuoc) {
        if (!(m in doc.thanh_phan)) them(m, `Chưa có ảnh ${ten(m)}`);
      }
    } else if (ma && duong.length === 2 && e.keyword === 'minItems') {
      them(ma, `Cần ít nhất ${dn[ma]?.minItems ?? 1} ảnh cho ${ten(ma)}`);
    } else if (ma && duong.length === 2 && e.keyword === 'maxItems') {
      them(ma, `Chỉ được gửi tối đa ${dn[ma]?.maxItems} ảnh cho ${ten(ma)}`);
    } else if (ma && e.keyword !== 'properties' && e.keyword !== 'items') {
      them(ma, `Giấy tờ ${ten(ma)} chưa hợp lệ`);
    }
  }
  return loi;
}
