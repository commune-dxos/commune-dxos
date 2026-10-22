// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { docCauHinh } from "./cau-hinh";
import { chuanHoa, lePhi, thoiHan } from "./dinh-dang";

describe("định dạng", () => {
  it("thời hạn theo ngày làm việc", () => {
    expect(thoiHan(0)).toBe("Trong ngày");
    expect(thoiHan(1)).toBe("1 ngày làm việc");
    expect(thoiHan(15)).toBe("15 ngày làm việc");
  });

  it("lệ phí bằng đồng, có dấu chấm ngăn nghìn", () => {
    expect(lePhi(0)).toBe("Miễn phí");
    expect(lePhi(2000)).toBe("2.000 đồng");
    expect(lePhi(200000)).toBe("200.000 đồng");
  });

  it("tìm không dấu", () => {
    expect(chuanHoa("Đăng ký KHAI SINH ")).toBe("dang ky khai sinh");
  });
});

describe("cấu hình", () => {
  it("mặc định khớp .env.example ở gốc repo", () => {
    expect(docCauHinh({})).toEqual({
      gatewayUrl: "http://localhost:9080",
      keycloakUrl: "http://localhost:8080",
      realm: "dxos",
      clientId: "mot_cua_web",
      duLieuGia: false,
    });
  });
});
