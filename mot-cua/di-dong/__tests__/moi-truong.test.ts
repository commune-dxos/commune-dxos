// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { DEMO_CONG_KHAI, docCauHinh } from '../src/cau-hinh/moi-truong';

describe('cấu hình môi trường', () => {
  it('bỏ trống thì trỏ bản demo công khai, client public mot_cua_di_dong', () => {
    const c = docCauHinh({});
    expect(c.gatewayUrl).toBe(DEMO_CONG_KHAI);
    expect(c.keycloakUrl).toBe(DEMO_CONG_KHAI);
    expect(c.realm).toBe('dxos');
    expect(c.clientId).toBe('mot_cua_di_dong');
    expect(c.redirectUrl).toBe('vn.communedxos.motcua:/oauth');
  });

  it('máy local: đọc biến DXOS_*, bỏ dấu / cuối', () => {
    const c = docCauHinh({
      DXOS_GATEWAY_URL: 'http://localhost:9080/',
      DXOS_KEYCLOAK_URL: 'http://localhost:8080',
      DXOS_KEYCLOAK_REALM: 'thu',
    });
    expect(c.gatewayUrl).toBe('http://localhost:9080');
    expect(c.keycloakUrl).toBe('http://localhost:8080');
    expect(c.realm).toBe('thu');
  });

  it('chỉ đặt gateway thì Keycloak đi cùng địa chỉ đó (APISIX phục vụ /realms)', () => {
    expect(docCauHinh({ DXOS_GATEWAY_URL: 'https://xa.example.vn' }).keycloakUrl).toBe('https://xa.example.vn');
  });
});
