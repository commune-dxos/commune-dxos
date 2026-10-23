// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Vai trò của người đăng nhập cổng cán bộ, đọc từ access token Keycloak (client role của dxos_api,
// cùng chỗ mot-cua-api và PostgREST đọc). Chỉ để chọn màn hình: web không kiểm chữ ký, mọi quyền
// thật do APISIX, mot-cua-api và RLS của CSDL kiểm lại ở mỗi request.

export const CLIENT_VAI_TRO = "dxos_api";
export type VaiTroCanBo = "can_bo" | "lanh_dao" | "van_thu";

export const TEN_VAI_TRO: Record<VaiTroCanBo, string> = {
  can_bo: "Cán bộ một cửa",
  lanh_dao: "Lãnh đạo xã",
  van_thu: "Văn thư",
};

function giaiMaPhan(jwt: string): unknown {
  const phan = jwt.split(".")[1];
  if (!phan) return null;
  const b64 = phan.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(phan.length / 4) * 4, "=");
  try {
    const nhiPhan = atob(b64);
    const byte = Uint8Array.from(nhiPhan, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(byte));
  } catch {
    return null;
  }
}

/** Danh sách client role dxos_api trong access token; token hỏng → []. */
export function docVaiTro(accessToken: string | undefined | null): string[] {
  if (!accessToken) return [];
  const claims = giaiMaPhan(accessToken) as { resource_access?: Record<string, { roles?: unknown }> } | null;
  const roles = claims?.resource_access?.[CLIENT_VAI_TRO]?.roles;
  return Array.isArray(roles) ? roles.filter((r): r is string => typeof r === "string") : [];
}

/** Vai được vào cổng cán bộ; ưu tiên lãnh đạo, rồi cán bộ, rồi văn thư (#78: chỉ sổ văn bản). Không có vai
 * nào → null ("không có quyền"). */
export function vaiTroCanBo(roles: string[]): VaiTroCanBo | null {
  if (roles.includes("lanh_dao")) return "lanh_dao";
  if (roles.includes("can_bo")) return "can_bo";
  if (roles.includes("van_thu")) return "van_thu";
  return null;
}
