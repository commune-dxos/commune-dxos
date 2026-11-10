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

/** Miền lỗi chung của AppAuth-iOS (OIDGeneralErrorDomain); hủy đăng nhập là mã -3. */
const MIEN_APPAUTH_IOS = 'org.openid.appauth.general';
/** ASWebAuthenticationSession, mã 1 = canceledLogin (người dùng bấm Hủy/đóng trang). */
const MIEN_ASWEB = 'com.apple.AuthenticationServices.WebAuthenticationSession';

interface LoiNative {
  code?: unknown;
  domain?: unknown;
  userInfo?: { NSUnderlyingError?: { code?: unknown; domain?: unknown } | null } | null;
}

/**
 * Người dùng bấm hủy hoặc đóng trang đăng nhập: không coi là lỗi.
 * - Android (AppAuth-Android): message "User cancelled flow".
 * - iOS: react-native-app-auth reject("authentication_failed", localizedDescription, NSError) với NSError
 *   OIDGeneralErrorDomain mã -3 (OIDErrorCodeUserCanceledAuthorizationFlow), không có mô tả, lỗi gốc là
 *   ASWebAuthenticationSession mã 1. React Native chỉ chuyển sang JS code (chuỗi), domain, userInfo; mã số -3
 *   chỉ còn trong câu mặc định "… (org.openid.appauth.general error -3.)". Nên dò lỗi gốc, hoặc mã -3 trong
 *   câu, và chỉ khi domain đúng miền chung của AppAuth (lỗi mạng -5 cùng miền vẫn báo như thường).
 */
export function laHuyDangNhap(loi: unknown) {
  const thongDiep = loi instanceof Error ? loi.message : String(loi);
  if (/cancel/i.test(thongDiep)) return true;
  const e = (typeof loi === 'object' && loi !== null ? loi : {}) as LoiNative;
  if (e.code !== 'authentication_failed' || e.domain !== MIEN_APPAUTH_IOS) return false;
  const goc = e.userInfo?.NSUnderlyingError;
  if (goc?.domain === MIEN_ASWEB && String(goc.code) === '1') return true;
  return /org\.openid\.appauth\.general\D{0,20}-3(?!\d)/.test(thongDiep);
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
    const c = JSON.parse(utf8) as {
      name?: string;
      preferred_username?: string;
      given_name?: string;
      family_name?: string;
    };
    const tenDangNhap = c.preferred_username ?? null;
    // Họ tên kiểu Việt: họ (family_name) trước tên (given_name), như cổng web; claim name của Keycloak ghép
    // tên trước họ nên chỉ dùng khi thiếu hai claim kia.
    const hoTen = [c.family_name, c.given_name].map(x => x?.trim()).filter(Boolean).join(' ');
    return { ten: hoTen || c.name || tenDangNhap || 'Công dân', tenDangNhap };
  } catch {
    return null;
  }
}
