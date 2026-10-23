// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { OidcClient } from "oidc-client-ts";
import { describe, expect, it } from "vitest";
import { docCauHinh } from "@/lib/cau-hinh";
import { taoCaiDatOidc } from "./oidc";

const caiDat = taoCaiDatOidc(docCauHinh({}), "http://localhost:5173");

describe("đăng nhập OIDC", () => {
  it("dùng realm dxos, client public mot_cua_web, không có secret", () => {
    expect(caiDat.authority).toBe("http://localhost:8080/realms/dxos");
    expect(caiDat.client_id).toBe("mot_cua_web");
    expect(caiDat.client_secret).toBeUndefined();
    expect(caiDat.redirect_uri).toBe("http://localhost:5173/dang-nhap/xong");
  });

  it("chuyển tới Keycloak bằng Authorization Code + PKCE S256", async () => {
    const client = new OidcClient({
      ...caiDat,
      metadata: {
        issuer: caiDat.authority,
        authorization_endpoint: `${caiDat.authority}/protocol/openid-connect/auth`,
      },
    });
    const yeuCau = await client.createSigninRequest({ state: { quayVe: "/" } });
    const url = new URL(yeuCau.url);
    expect(url.origin + url.pathname).toBe("http://localhost:8080/realms/dxos/protocol/openid-connect/auth");
    const q = url.searchParams;
    expect(q.get("response_type")).toBe("code");
    expect(q.get("client_id")).toBe("mot_cua_web");
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(q.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(q.get("ui_locales")).toBe("vi");
    expect(q.has("client_secret")).toBe(false);
  });

  it("cổng cán bộ: client public riêng mot_cua_can_bo, quay về /can-bo, không có secret", async () => {
    const cb = taoCaiDatOidc(docCauHinh({}), "http://localhost:9080", "can-bo");
    expect(cb.client_id).toBe("mot_cua_can_bo");
    expect(cb.client_secret).toBeUndefined();
    expect(cb.redirect_uri).toBe("http://localhost:9080/can-bo/dang-nhap/xong");
    expect(cb.post_logout_redirect_uri).toBe("http://localhost:9080/can-bo");
    const client = new OidcClient({
      ...cb,
      metadata: { issuer: cb.authority, authorization_endpoint: `${cb.authority}/protocol/openid-connect/auth` },
    });
    const q = new URL((await client.createSigninRequest({ state: {} })).url).searchParams;
    expect(q.get("client_id")).toBe("mot_cua_can_bo");
    expect(q.get("code_challenge_method")).toBe("S256");
  });
});
