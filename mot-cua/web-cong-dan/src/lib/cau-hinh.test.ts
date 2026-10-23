// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { docCauHinh } from "./cau-hinh";

describe("docCauHinh", () => {
  it("không có cấu hình lúc chạy: dùng biến VITE_*, bỏ dấu / cuối", () => {
    const c = docCauHinh({ VITE_GATEWAY_URL: "http://gw:9080/", VITE_KEYCLOAK_URL: "http://kc:8080/" }, {});
    expect(c).toMatchObject({ gatewayUrl: "http://gw:9080", keycloakUrl: "http://kc:8080", realm: "dxos", clientId: "mot_cua_web" });
    expect(c.clientIdCanBo).toBe("mot_cua_can_bo");
  });

  it("cấu hình lúc chạy (/cau-hinh.js) thắng biến build; gateway rỗng = cùng origin", () => {
    const c = docCauHinh(
      { VITE_GATEWAY_URL: "http://gw:9080", VITE_KEYCLOAK_URL: "http://kc:8080" },
      { gatewayUrl: "", keycloakUrl: "https://sso.xa.vn/", realm: "xa", clientId: "web_xa", clientIdCanBo: "can_bo_xa" },
    );
    expect(c).toMatchObject({
      gatewayUrl: "",
      keycloakUrl: "https://sso.xa.vn",
      realm: "xa",
      clientId: "web_xa",
      clientIdCanBo: "can_bo_xa",
    });
  });

  it("cấu hình lúc chạy rỗng ({} của public/cau-hinh.js khi dev): giữ biến build", () => {
    const c = docCauHinh({ VITE_GATEWAY_URL: "http://gw:9080" }, {});
    expect(c.gatewayUrl).toBe("http://gw:9080");
  });
});
