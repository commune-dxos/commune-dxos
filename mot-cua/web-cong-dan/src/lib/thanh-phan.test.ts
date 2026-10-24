// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import duLieuGia from "@/du-lieu-gia/thu-tuc.json";
import type { ThuTuc } from "./api";
import { docThanhPhan, kiemThanhPhan, taiLieuHoSo } from "./thanh-phan";

const KS01 = (duLieuGia as ThuTuc[]).find((t) => t.ma === "KS01")!;
const CT01 = (duLieuGia as ThuTuc[]).find((t) => t.ma === "CT01")!;

describe("thành phần hồ sơ từ JSON Schema", () => {
  it("đọc tên, mô tả, bắt buộc theo required", () => {
    const ds = docThanhPhan(KS01.json_schema);
    expect(ds.map((t) => [t.ma, t.batBuoc])).toEqual([
      ["to_khai", true],
      ["giay_chung_sinh", true],
      ["giay_to_tuy_than", true],
      ["giay_ket_hon_cha_me", false],
    ]);
    expect(ds[1].ten).toBe("Giấy chứng sinh");
    expect(ds[1].moTa).toMatch(/người làm chứng/);
  });

  it("thủ tục chưa có gói thì không có thành phần", () => {
    expect(docThanhPhan(null)).toEqual([]);
  });

  it("Poka-yoke theo JSON Schema 2020-12: thiếu thành phần bắt buộc thì báo lỗi, thiếu thành phần 'nếu có' thì không", () => {
    const tep = new File(["x"], "a.png", { type: "image/png" });
    expect(kiemThanhPhan(KS01.json_schema, { to_khai: [tep] })).toEqual({
      giay_chung_sinh: "Chưa tải giấy chứng sinh",
      giay_to_tuy_than: "Chưa tải giấy tờ tùy thân của người đi đăng ký",
    });
    expect(kiemThanhPhan(KS01.json_schema, { to_khai: [tep], giay_chung_sinh: [tep], giay_to_tuy_than: [tep] })).toEqual({});
    expect(kiemThanhPhan(CT01.json_schema, {})).toEqual({ ban_chinh: "Chưa tải bản chính giấy tờ cần chứng thực" });
    expect(kiemThanhPhan(CT01.json_schema, { ban_chinh: [tep], ban_sao: [] })).toEqual({});
  });

  it("đọc minItems, maxItems của schema bất kỳ (không viết tay theo thủ tục)", () => {
    const schema = {
      properties: {
        thanh_phan: {
          type: "object",
          additionalProperties: false,
          required: ["anh"],
          properties: { anh: { title: "Ảnh chân dung", type: "array", items: { type: "string", format: "uuid" }, minItems: 2, maxItems: 3 } },
        },
      },
    };
    const tep = (n: number) => Array.from({ length: n }, (_, i) => new File(["x"], `${i}.png`));
    expect(kiemThanhPhan(schema, { anh: tep(1) })).toEqual({ anh: "Cần ít nhất 2 tệp cho ảnh chân dung" });
    expect(kiemThanhPhan(schema, { anh: tep(4) })).toEqual({ anh: "Chỉ được tải tối đa 3 tệp cho ảnh chân dung" });
    expect(kiemThanhPhan(schema, { anh: tep(2) })).toEqual({});
  });

  it("tài liệu kiểm cùng dạng máy chủ dựng: id UUID cho mỗi tệp, bỏ thành phần chưa có tệp", () => {
    const tep = new File(["x"], "a.png");
    expect(taiLieuHoSo({ to_khai: [tep, tep], ban_sao: [] })).toEqual({
      thanh_phan: { to_khai: ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"] },
    });
  });

  it("thủ tục chưa có gói (schema null) thì không có lỗi để kiểm", () => {
    expect(kiemThanhPhan(null, {})).toEqual({});
  });
});
