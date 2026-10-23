// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { TEN_TRANG_THAI, tenTrangThai } from "./trang-thai";

describe("tên trạng thái hồ sơ", () => {
  it("có tên cho đủ 6 giá trị của CHECK trong migration 006", () => {
    expect(Object.keys(TEN_TRANG_THAI).sort()).toEqual(
      ["cho_bo_sung", "cho_phe_duyet", "dang_xu_ly", "hoan_tat", "moi", "tu_choi"],
    );
    expect(tenTrangThai("cho_phe_duyet")).toBe("Chờ lãnh đạo phê duyệt");
  });

  it("giá trị lạ hiện nguyên mã", () => {
    expect(tenTrangThai("trang_thai_moi_hon")).toBe("trang_thai_moi_hon");
  });
});
