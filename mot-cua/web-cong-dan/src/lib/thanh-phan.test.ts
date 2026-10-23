// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import duLieuGia from "@/du-lieu-gia/thu-tuc.json";
import type { ThuTuc } from "./api";
import { docThanhPhan, kiemThanhPhan } from "./thanh-phan";

const KS01 = (duLieuGia as ThuTuc[]).find((t) => t.ma === "KS01")!;

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

  it("Poka-yoke: thiếu thành phần bắt buộc thì báo lỗi, thiếu thành phần 'nếu có' thì không", () => {
    const ds = docThanhPhan(KS01.json_schema);
    const tep = new File(["x"], "a.png", { type: "image/png" });
    expect(Object.keys(kiemThanhPhan(ds, { to_khai: [tep] }))).toEqual(["giay_chung_sinh", "giay_to_tuy_than"]);
    expect(kiemThanhPhan(ds, { to_khai: [tep], giay_chung_sinh: [tep], giay_to_tuy_than: [tep] })).toEqual({});
  });
});
