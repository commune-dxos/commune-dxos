// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { docCauHinh } from '../src/cau-hinh/moi-truong';
import type { HamFetch } from '../src/dich-vu/goi-api';
import { chuanHoaMa, kiemNhapTraCuu, traCuuCongKhai } from '../src/dich-vu/tra-cuu';

const cauHinh = docCauHinh({ DXOS_GATEWAY_URL: 'http://gw.test' });

describe('tra cứu hồ sơ không cần đăng nhập', () => {
  it('chuẩn hóa mã: bỏ khoảng trắng, viết hoa', () => {
    expect(chuanHoaMa(' hs20261024-000123 ')).toBe('HS20261024-000123');
  });

  it('kiểm nhập trước khi gửi', () => {
    expect(kiemNhapTraCuu('HS20261024-000123', '1234')).toEqual({});
    expect(kiemNhapTraCuu('123', '12')).toEqual({
      ma: expect.stringContaining('HS20261024-000123'),
      soCuoi: expect.stringContaining('4 chữ số cuối'),
    });
  });

  it('gọi RPC công khai, không gửi token, mã đã chuẩn hóa', async () => {
    const ketQua = {
      ma_ho_so: 'HS20261024-000123',
      thu_tuc: { ma: 'KS01', ten: 'Đăng ký khai sinh' },
      trang_thai: 'dang_xu_ly',
      ngay_nhan: '2026-10-24',
      han_xu_ly: '2026-10-27',
      ngay_hoan_tat: null,
      lich_su: [{ trang_thai: 'moi', luc: '2026-10-24T08:00:00+07:00' }],
    };
    const goi = jest.fn<Promise<Response>, Parameters<HamFetch>>(
      async () => new Response(JSON.stringify(ketQua), { status: 200 }),
    );
    await expect(traCuuCongKhai('hs20261024-000123', ' 1234', cauHinh, goi)).resolves.toEqual(ketQua);
    const [url, init] = goi.mock.calls[0]!;
    expect(url).toBe('http://gw.test/public/rpc/tra_cuu_ho_so?p_ma=HS20261024-000123&p_so_cuoi=1234');
    expect(init.headers).not.toHaveProperty('Authorization');
  });

  it('sai mã hoặc số → null (không lộ hồ sơ có tồn tại hay không)', async () => {
    const goi = jest.fn<Promise<Response>, Parameters<HamFetch>>(async () => new Response('null', { status: 200 }));
    await expect(traCuuCongKhai('HS20261024-000999', '0000', cauHinh, goi)).resolves.toBeNull();
  });
});
