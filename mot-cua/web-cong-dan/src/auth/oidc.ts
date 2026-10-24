// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Đăng nhập: OpenID Connect Authorization Code + PKCE (S256) với Keycloak realm dxos. Hai client
// public (mot-cua/keycloak/realm.json): mot_cua_web cho cổng công dân, mot_cua_can_bo cho cổng cán bộ
// /can-bo (#55; Keycloak tự đòi OTP với vai can_bo, lanh_dao). Không có client secret trong web.
// Token lưu ở sessionStorage của tab (mặc định oidc-client-ts, khóa theo client nên hai cổng không
// lẫn phiên), mất khi đóng tab.
import { UserManager, type UserManagerSettings } from "oidc-client-ts";
import { cauHinh as cauHinhMacDinh, type CauHinh } from "@/lib/cau-hinh";

export const DUONG_DAN_XONG = "/dang-nhap/xong";
export const GOC_CAN_BO = "/can-bo";
export const DUONG_DAN_XONG_CAN_BO = GOC_CAN_BO + DUONG_DAN_XONG;

export function taoCaiDatOidc(cauHinh: CauHinh, goc: string, cong: "cong-dan" | "can-bo" = "cong-dan"): UserManagerSettings {
  const canBo = cong === "can-bo";
  return {
    authority: `${cauHinh.keycloakUrl}/realms/${cauHinh.realm}`,
    client_id: canBo ? cauHinh.clientIdCanBo : cauHinh.clientId,
    redirect_uri: goc + (canBo ? DUONG_DAN_XONG_CAN_BO : DUONG_DAN_XONG),
    post_logout_redirect_uri: goc + (canBo ? GOC_CAN_BO : "/"),
    response_type: "code",
    scope: "openid profile",
    ui_locales: "vi",
    automaticSilentRenew: true,
  };
}

let quanLy: UserManager | null = null;
let quanLyCanBo: UserManager | null = null;

export function layQuanLy(cauHinh: CauHinh = cauHinhMacDinh): UserManager {
  quanLy ??= new UserManager(taoCaiDatOidc(cauHinh, window.location.origin));
  return quanLy;
}

export function layQuanLyCanBo(cauHinh: CauHinh = cauHinhMacDinh): UserManager {
  quanLyCanBo ??= new UserManager(taoCaiDatOidc(cauHinh, window.location.origin, "can-bo"));
  return quanLyCanBo;
}
