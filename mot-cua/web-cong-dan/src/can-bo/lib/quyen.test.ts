// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { jwtGia } from "../test/gia";
import { docVaiTro, vaiTroCanBo } from "./quyen";

describe("quyền vào cổng cán bộ", () => {
  it("đọc client role dxos_api từ access token (kể cả tên có dấu trong payload)", () => {
    const tk = jwtGia({ name: "Trần Thị Một Cửa", resource_access: { dxos_api: { roles: ["can_bo"] }, account: { roles: ["x"] } } });
    expect(docVaiTro(tk)).toEqual(["can_bo"]);
    expect(vaiTroCanBo(docVaiTro(tk))).toBe("can_bo");
  });

  it("lãnh đạo vào được; có cả hai vai thì là lãnh đạo", () => {
    expect(vaiTroCanBo(["lanh_dao"])).toBe("lanh_dao");
    expect(vaiTroCanBo(["can_bo", "lanh_dao"])).toBe("lanh_dao");
  });

  it("công dân, tài khoản dịch vụ, role của client khác, token hỏng → không có quyền", () => {
    expect(vaiTroCanBo(docVaiTro(jwtGia({ resource_access: { dxos_api: { roles: ["cong_dan"] } } })))).toBeNull();
    expect(vaiTroCanBo(docVaiTro(jwtGia({ resource_access: { dxos_api: { roles: ["dich_vu_tep"] } } })))).toBeNull();
    expect(vaiTroCanBo(docVaiTro(jwtGia({ resource_access: { khac: { roles: ["can_bo"] } } })))).toBeNull();
    expect(vaiTroCanBo(docVaiTro(jwtGia({ realm_access: { roles: ["can_bo"] } })))).toBeNull();
    expect(docVaiTro("khong-phai-jwt")).toEqual([]);
    expect(docVaiTro(undefined)).toEqual([]);
  });
});
