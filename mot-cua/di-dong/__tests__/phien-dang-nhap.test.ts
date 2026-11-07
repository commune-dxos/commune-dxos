// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { authorize, logout, refresh } from 'react-native-app-auth';
import * as Keychain from 'react-native-keychain';
import { docCauHinh } from '../src/cau-hinh/moi-truong';
import { HET_PHIEN } from '../src/dich-vu/goi-api';
import { cauHinhOidc, conHan, docNguoiDung, type Phien } from '../src/dich-vu/xac-thuc';
import { usePhien } from '../src/kho/phien-dang-nhap';

jest.mock('react-native-app-auth', () => ({ authorize: jest.fn(), refresh: jest.fn(), logout: jest.fn() }));

let mockKho: string | null = null;
jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AccessibleWhenUnlockedThisDeviceOnly' },
  setGenericPassword: jest.fn(async (_u: string, p: string) => {
    mockKho = p;
    return { service: 'x', storage: 'x' };
  }),
  getGenericPassword: jest.fn(async () => (mockKho ? { username: 'phien', password: mockKho } : false)),
  resetGenericPassword: jest.fn(async () => {
    mockKho = null;
    return true;
  }),
}));

/** JWT giả (không ký) có payload cho trước. */
function jwt(payload: object) {
  const b = (o: object) =>
    btoa(
      encodeURIComponent(JSON.stringify(o)).replace(/%([0-9A-F]{2})/g, (_m, h: string) =>
        String.fromCharCode(parseInt(h, 16)),
      ),
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/[=]+$/, '');
  return `${b({ alg: 'none' })}.${b(payload)}.x`;
}

const sau = (giay: number) => new Date(Date.now() + giay * 1000).toISOString();
const ketQuaDangNhap = (hetGiay = 300) => ({
  accessToken: jwt({ name: 'Nguyễn Văn An', preferred_username: 'congdan01' }),
  accessTokenExpirationDate: sau(hetGiay),
  refreshToken: 'rt-1',
  idToken: 'id-1',
  tokenType: 'Bearer',
  scopes: ['openid'],
  authorizationCode: 'c',
});

beforeEach(() => {
  mockKho = null;
  jest.clearAllMocks();
  usePhien.setState({ phien: null, nguoiDung: null, dangKhoiPhuc: true, dangXuLy: false, loi: null });
});

describe('cấu hình OIDC', () => {
  it('client public mot_cua_di_dong, PKCE, không có client secret, endpoint https theo issuer', () => {
    const c = cauHinhOidc(docCauHinh({}));
    expect(c.issuer).toBe('https://commune.dzfullstack.com/realms/dxos');
    expect(c.clientId).toBe('mot_cua_di_dong');
    expect(c.usePKCE).toBe(true);
    expect(c).not.toHaveProperty('clientSecret');
    expect(c.redirectUrl).toBe('vn.communedxos.motcua:/oauth');
    expect(c.serviceConfiguration?.tokenEndpoint).toBe(
      'https://commune.dzfullstack.com/realms/dxos/protocol/openid-connect/token',
    );
    expect(c.dangerouslyAllowInsecureHttpRequests).toBe(false);
    expect(c.additionalParameters).toEqual({ ui_locales: 'vi' });
  });

  it('máy local http thì mới cho phép HTTP', () => {
    const c = cauHinhOidc(docCauHinh({ DXOS_KEYCLOAK_URL: 'http://localhost:8080' }));
    expect(c.dangerouslyAllowInsecureHttpRequests).toBe(true);
  });

  it('đọc tên tiếng Việt có dấu từ access token', () => {
    expect(docNguoiDung(jwt({ name: 'Nguyễn Văn An', preferred_username: 'congdan01' }))).toEqual({
      ten: 'Nguyễn Văn An',
      tenDangNhap: 'congdan01',
    });
    expect(docNguoiDung('khong-phai-jwt')).toBeNull();
  });

  it('conHan có dự phòng 30 giây', () => {
    const p: Phien = { accessToken: 'a', refreshToken: null, idToken: null, hetHan: sau(20) };
    expect(conHan(p)).toBe(false);
    expect(conHan({ ...p, hetHan: sau(120) })).toBe(true);
  });
});

describe('mockKho phiên đăng nhập', () => {
  it('đăng nhập: lưu token vào Keychain, có tên người dùng', async () => {
    (authorize as jest.Mock).mockResolvedValue(ketQuaDangNhap());
    await expect(usePhien.getState().dangNhap()).resolves.toBe(true);
    const s = usePhien.getState();
    expect(s.phien?.refreshToken).toBe('rt-1');
    expect(s.nguoiDung?.ten).toBe('Nguyễn Văn An');
    expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
      'phien',
      expect.any(String),
      expect.objectContaining({ accessible: 'AccessibleWhenUnlockedThisDeviceOnly' }),
    );
  });

  it('người dùng hủy đăng nhập thì không báo lỗi', async () => {
    (authorize as jest.Mock).mockRejectedValue(new Error('User cancelled flow'));
    await expect(usePhien.getState().dangNhap()).resolves.toBe(false);
    expect(usePhien.getState().loi).toBeNull();
  });

  it('lỗi khác thì báo câu trung tính', async () => {
    (authorize as jest.Mock).mockRejectedValue(new Error('Connection refused'));
    await usePhien.getState().dangNhap();
    expect(usePhien.getState().loi).toMatch(/Chưa đăng nhập được/);
    expect(usePhien.getState().loi).not.toMatch(/Connection/);
  });

  it('mở lại app: khôi phục phiên còn hạn từ Keychain', async () => {
    (authorize as jest.Mock).mockResolvedValue(ketQuaDangNhap());
    await usePhien.getState().dangNhap();
    usePhien.setState({ phien: null, nguoiDung: null, dangKhoiPhuc: true });
    await usePhien.getState().khoiPhuc();
    expect(usePhien.getState().dangKhoiPhuc).toBe(false);
    expect(usePhien.getState().nguoiDung?.tenDangNhap).toBe('congdan01');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('token sắp hết hạn: các lời gọi cùng lúc chỉ làm mới một lần, giữ refresh token cũ nếu không có mới', async () => {
    (authorize as jest.Mock).mockResolvedValue(ketQuaDangNhap(10));
    await usePhien.getState().dangNhap();
    (refresh as jest.Mock).mockResolvedValue({
      accessToken: 'at-2',
      accessTokenExpirationDate: sau(300),
      refreshToken: null,
      idToken: '',
      tokenType: 'Bearer',
    });
    const [a, b] = await Promise.all([usePhien.getState().layToken(), usePhien.getState().layToken()]);
    expect(a).toBe('at-2');
    expect(b).toBe('at-2');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(usePhien.getState().phien).toMatchObject({ refreshToken: 'rt-1', idToken: 'id-1' });
  });

  it('làm mới hỏng (refresh token hết hạn): xóa phiên, báo hết phiên', async () => {
    (authorize as jest.Mock).mockResolvedValue(ketQuaDangNhap(10));
    await usePhien.getState().dangNhap();
    (refresh as jest.Mock).mockRejectedValue(new Error('invalid_grant'));
    await expect(usePhien.getState().layToken()).rejects.toMatchObject({ message: HET_PHIEN, trangThai: 401 });
    expect(usePhien.getState().phien).toBeNull();
    expect(mockKho).toBeNull();
  });

  it('chưa đăng nhập mà gọi API cần token → 401 có câu hướng dẫn', async () => {
    await expect(usePhien.getState().layToken()).rejects.toMatchObject({ trangThai: 401 });
  });

  it('đăng xuất: kết thúc phiên Keycloak bằng id_token, xóa Keychain kể cả khi mất mạng', async () => {
    (authorize as jest.Mock).mockResolvedValue(ketQuaDangNhap());
    await usePhien.getState().dangNhap();
    (logout as jest.Mock).mockRejectedValue(new Error('network'));
    await usePhien.getState().dangXuat();
    expect(logout).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'mot_cua_di_dong' }),
      { idToken: 'id-1', postLogoutRedirectUrl: 'vn.communedxos.motcua:/oauth' },
    );
    expect(usePhien.getState().phien).toBeNull();
    expect(mockKho).toBeNull();
  });
});
