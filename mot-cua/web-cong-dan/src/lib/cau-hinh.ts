// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Cấu hình của web, không có bí mật (hai client OIDC đều public + PKCE: mot_cua_web cho cổng công dân,
// mot_cua_can_bo cho cổng cán bộ /can-bo, #55). Hai nguồn, theo thứ tự ưu tiên:
//   1. window.__DXOS_CAU_HINH__ do /cau-hinh.js đặt lúc chạy (container mot-cua-web sinh từ biến
//      môi trường, #57); gatewayUrl rỗng = gọi lõi qua chính origin của trang (APISIX phục vụ web).
//   2. biến VITE_* lúc build (.env.example), dùng khi chạy `npm run dev`.

export interface CauHinh {
  /** APISIX – điểm vào duy nhất tới lõi Tầng 1. Rỗng = cùng origin với trang. */
  gatewayUrl: string;
  keycloakUrl: string;
  realm: string;
  clientId: string;
  /** Client public của cổng cán bộ (/can-bo). */
  clientIdCanBo: string;
  /** Dùng dữ liệu giả trong src/du-lieu-gia/ thay cho gọi APISIX. */
  duLieuGia: boolean;
}

export type CauHinhLucChay = Partial<Pick<CauHinh, "gatewayUrl" | "keycloakUrl" | "realm" | "clientId" | "clientIdCanBo">>;

declare global {
  interface Window {
    __DXOS_CAU_HINH__?: CauHinhLucChay;
  }
}

function boCheoCuoi(url: string) {
  return url.replace(/\/+$/, "");
}

export function docCauHinh(
  env: Record<string, string | undefined> = import.meta.env,
  lucChay: CauHinhLucChay = (typeof window !== "undefined" && window.__DXOS_CAU_HINH__) || {},
): CauHinh {
  return {
    gatewayUrl: boCheoCuoi(lucChay.gatewayUrl ?? (env.VITE_GATEWAY_URL || "http://localhost:9080")),
    keycloakUrl: boCheoCuoi(lucChay.keycloakUrl || env.VITE_KEYCLOAK_URL || "http://localhost:8080"),
    realm: lucChay.realm || env.VITE_KEYCLOAK_REALM || "dxos",
    clientId: lucChay.clientId || env.VITE_OIDC_CLIENT_ID || "mot_cua_web",
    clientIdCanBo: lucChay.clientIdCanBo || env.VITE_OIDC_CLIENT_ID_CAN_BO || "mot_cua_can_bo",
    duLieuGia: env.VITE_DU_LIEU_GIA === "1",
  };
}

export const cauHinh = docCauHinh();
