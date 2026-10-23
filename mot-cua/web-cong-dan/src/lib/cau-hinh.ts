// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Cấu hình đọc từ biến VITE_* lúc build (.env.example). Không có bí mật: client OIDC là public + PKCE.

export interface CauHinh {
  /** APISIX – điểm vào duy nhất tới lõi Tầng 1. */
  gatewayUrl: string;
  keycloakUrl: string;
  realm: string;
  clientId: string;
  /** Dùng dữ liệu giả trong src/du-lieu-gia/ thay cho gọi APISIX. */
  duLieuGia: boolean;
}

function boCheoCuoi(url: string) {
  return url.replace(/\/+$/, "");
}

export function docCauHinh(env: Record<string, string | undefined> = import.meta.env): CauHinh {
  return {
    gatewayUrl: boCheoCuoi(env.VITE_GATEWAY_URL || "http://localhost:9080"),
    keycloakUrl: boCheoCuoi(env.VITE_KEYCLOAK_URL || "http://localhost:8080"),
    realm: env.VITE_KEYCLOAK_REALM || "dxos",
    clientId: env.VITE_OIDC_CLIENT_ID || "mot_cua_web",
    duLieuGia: env.VITE_DU_LIEU_GIA === "1",
  };
}

export const cauHinh = docCauHinh();
