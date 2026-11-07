// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Cấu hình của app, không có bí mật (client Keycloak mot_cua_di_dong là public + PKCE). Giá trị lấy từ
// biến DXOS_* lúc đóng gói (.env, xem .env.example và babel.config.js); bỏ trống thì trỏ bản demo công
// khai. App gọi lõi Tầng 1 qua APISIX như cổng công dân: /public, /api (PostgREST), /files, /workflow.

export const DEMO_CONG_KHAI = 'https://commune.dzfullstack.com';

/** Scheme riêng của app, khai trong android/app/build.gradle (appAuthRedirectScheme). */
export const SCHEME_UNG_DUNG = 'vn.communedxos.motcua';

export interface CauHinh {
  /** APISIX: điểm vào duy nhất tới lõi. */
  gatewayUrl: string;
  keycloakUrl: string;
  realm: string;
  clientId: string;
  /** URI quay về app sau khi đăng nhập, đăng xuất (đã khai trong client Keycloak). */
  redirectUrl: string;
}

const boCheoCuoi = (url: string) => url.replace(/\/+$/, '');

export function docCauHinh(env: Record<string, string | undefined>): CauHinh {
  return {
    gatewayUrl: boCheoCuoi(env.DXOS_GATEWAY_URL || DEMO_CONG_KHAI),
    keycloakUrl: boCheoCuoi(env.DXOS_KEYCLOAK_URL || env.DXOS_GATEWAY_URL || DEMO_CONG_KHAI),
    realm: env.DXOS_KEYCLOAK_REALM || 'dxos',
    clientId: env.DXOS_OIDC_CLIENT_ID || 'mot_cua_di_dong',
    redirectUrl: `${SCHEME_UNG_DUNG}:/oauth`,
  };
}

// Viết rõ từng biến: babel chỉ thay được dạng process.env.DXOS_TEN.
export const cauHinh = docCauHinh({
  DXOS_GATEWAY_URL: process.env.DXOS_GATEWAY_URL,
  DXOS_KEYCLOAK_URL: process.env.DXOS_KEYCLOAK_URL,
  DXOS_KEYCLOAK_REALM: process.env.DXOS_KEYCLOAK_REALM,
  DXOS_OIDC_CLIENT_ID: process.env.DXOS_OIDC_CLIENT_ID,
});
