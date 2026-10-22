// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Đăng nhập công dân: OpenID Connect Authorization Code + PKCE (S256) với Keycloak realm dxos,
// client public mot_cua_web (mot-cua/keycloak/realm.json). Không có client secret trong web.
// Token lưu ở sessionStorage của tab (mặc định oidc-client-ts), mất khi đóng tab.
import { UserManager, type UserManagerSettings } from "oidc-client-ts";
import { cauHinh as cauHinhMacDinh, type CauHinh } from "@/lib/cau-hinh";

export const DUONG_DAN_XONG = "/dang-nhap/xong";

export function taoCaiDatOidc(cauHinh: CauHinh, goc: string): UserManagerSettings {
  return {
    authority: `${cauHinh.keycloakUrl}/realms/${cauHinh.realm}`,
    client_id: cauHinh.clientId,
    redirect_uri: goc + DUONG_DAN_XONG,
    post_logout_redirect_uri: goc + "/",
    response_type: "code",
    scope: "openid profile",
    ui_locales: "vi",
    automaticSilentRenew: true,
  };
}

let quanLy: UserManager | null = null;

export function layQuanLy(cauHinh: CauHinh = cauHinhMacDinh): UserManager {
  quanLy ??= new UserManager(taoCaiDatOidc(cauHinh, window.location.origin));
  return quanLy;
}
