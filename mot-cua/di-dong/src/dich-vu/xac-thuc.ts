// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Đăng nhập công dân: OpenID Connect Authorization Code + PKCE (S256) với Keycloak realm dxos, client
// public mot_cua_di_dong (mot-cua/keycloak/realm.json), không có client secret trong app. Trình duyệt hệ
// thống (Custom Tab) mở trang đăng nhập Keycloak rồi quay về vn.communedxos.motcua:/oauth.
// Token lưu trong Android Keystore (react-native-keychain), không lưu ở AsyncStorage.
//
// Endpoint khai tường minh theo issuer thay vì đọc .well-known: bản demo đứng sau reverse proxy có lúc
// trả token_endpoint dạng http://, AppAuth sẽ từ chối.
import { authorize, logout, refresh, type AuthConfiguration } from 'react-native-app-auth';
import * as Keychain from 'react-native-keychain';
import { cauHinh as cauHinhMacDinh, type CauHinh } from '../cau-hinh/moi-truong';

export interface Phien {
  accessToken: string;
  refreshToken: string | null;
  idToken: string | null;
  /** ISO 8601, hết hạn của access token. */
  hetHan: string;
}

export interface NguoiDung {
  ten: string;
  tenDangNhap: string | null;
}

const DICH_VU_KEYCHAIN = 'vn.communedxos.motcua.phien';

export function cauHinhOidc(c: CauHinh = cauHinhMacDinh): AuthConfiguration {
  const issuer = `${c.keycloakUrl}/realms/${c.realm}`;
  const oidc = `${issuer}/protocol/openid-connect`;
  return {
    issuer,
    serviceConfiguration: {
      authorizationEndpoint: `${oidc}/auth`,
      tokenEndpoint: `${oidc}/token`,
      endSessionEndpoint: `${oidc}/logout`,
      revocationEndpoint: `${oidc}/revoke`,
    },
    clientId: c.clientId,
    redirectUrl: c.redirectUrl,
    scopes: ['openid', 'profile'],
    usePKCE: true,
    additionalParameters: { ui_locales: 'vi' },
    // Chỉ cho HTTP khi trỏ máy local (http://localhost qua adb reverse).
    dangerouslyAllowInsecureHttpRequests: issuer.startsWith('http://'),
  };
}

function thanhPhien(kq: {
  accessToken: string;
  accessTokenExpirationDate: string;
  refreshToken: string | null;
  idToken: string | null;
}): Phien {
  return {
    accessToken: kq.accessToken,
    refreshToken: kq.refreshToken || null,
    idToken: kq.idToken || null,
    hetHan: kq.accessTokenExpirationDate,
  };
}

/** Người dùng bấm hủy hoặc đóng trang đăng nhập: không coi là lỗi. */
export function laHuyDangNhap(loi: unknown) {
  const thongDiep = loi instanceof Error ? loi.message : String(loi);
  return /cancel/i.test(thongDiep);
}

export async function dangNhapOidc(c?: CauHinh) {
  return thanhPhien(await authorize(cauHinhOidc(c)));
}

/** Làm mới access token; refresh token cũ được giữ nếu Keycloak không trả cái mới. */
export async function lamMoiOidc(phien: Phien, c?: CauHinh): Promise<Phien> {
  if (!phien.refreshToken) throw new Error('Không có refresh token');
  const kq = await refresh(cauHinhOidc(c), { refreshToken: phien.refreshToken });
  return thanhPhien({
    ...kq,
    refreshToken: kq.refreshToken || phien.refreshToken,
    idToken: kq.idToken || phien.idToken,
  });
}

/** Kết thúc phiên ở Keycloak (end_session_endpoint). Lỗi mạng không chặn đăng xuất trên máy. */
export async function dangXuatOidc(phien: Phien, c?: CauHinh) {
  if (!phien.idToken) return;
  const cfg = cauHinhOidc(c);
  await logout(cfg, { idToken: phien.idToken, postLogoutRedirectUrl: cfg.redirectUrl });
}

export async function luuPhien(phien: Phien) {
  await Keychain.setGenericPassword('phien', JSON.stringify(phien), {
    service: DICH_VU_KEYCHAIN,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function docPhien(): Promise<Phien | null> {
  const ban = await Keychain.getGenericPassword({ service: DICH_VU_KEYCHAIN });
  if (!ban) return null;
  try {
    const p = JSON.parse(ban.password) as Partial<Phien>;
    return typeof p.accessToken === 'string' && typeof p.hetHan === 'string'
      ? { accessToken: p.accessToken, refreshToken: p.refreshToken ?? null, idToken: p.idToken ?? null, hetHan: p.hetHan }
      : null;
  } catch {
    return null;
  }
}

export async function xoaPhien() {
  await Keychain.resetGenericPassword({ service: DICH_VU_KEYCHAIN });
}

/** Còn hạn ít nhất `duPhongGiay` giây nữa. */
export function conHan(phien: Phien, bayGio = Date.now(), duPhongGiay = 30) {
  const het = Date.parse(phien.hetHan);
  return Number.isFinite(het) && het - bayGio > duPhongGiay * 1000;
}

/** Đọc tên hiển thị từ phần payload của access token (không kiểm chữ ký: chỉ để hiện tên). */
export function docNguoiDung(accessToken: string): NguoiDung | null {
  const phan = accessToken.split('.')[1];
  if (!phan) return null;
  try {
    const b64 = phan.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(phan.length / 4) * 4, '=');
    const nhiPhan = atob(b64);
    const utf8 = decodeURIComponent(
      nhiPhan
        .split('')
        .map(ch => '%' + ch.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );
    const c = JSON.parse(utf8) as { name?: string; preferred_username?: string; given_name?: string };
    const tenDangNhap = c.preferred_username ?? null;
    return { ten: c.name || c.given_name || tenDangNhap || 'Công dân', tenDangNhap };
  } catch {
    return null;
  }
}
