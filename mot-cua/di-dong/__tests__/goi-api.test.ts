// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { docCauHinh } from '../src/cau-hinh/moi-truong';
import { coNenThuLai } from '../src/cau-hinh/truy-van';
import { HET_PHIEN, KHONG_KET_NOI, LoiApi, cauLoi, goiGateway, type HamFetch } from '../src/dich-vu/goi-api';

const cauHinh = docCauHinh({ DXOS_GATEWAY_URL: 'http://gw.test' });

function traVe(status: number, than: unknown): jest.MockedFunction<HamFetch> {
  return jest.fn<Promise<Response>, Parameters<HamFetch>>(async () => new Response(than === '' ? null : typeof than === 'string' ? than : JSON.stringify(than), { status }));
}

describe('gọi lõi qua APISIX', () => {
  it('ghép địa chỉ gateway, gửi Accept và Bearer token', async () => {
    const goi = traVe(200, [{ id: 1 }]);
    const kq = await goiGateway<{ id: number }[]>('/api/ho_so', { token: 'abc' }, cauHinh, goi);
    expect(kq).toEqual([{ id: 1 }]);
    const [url, init] = goi.mock.calls[0]!;
    expect(url).toBe('http://gw.test/api/ho_so');
    expect(init.method).toBe('GET');
    expect(init.headers).toMatchObject({ Accept: 'application/json', Authorization: 'Bearer abc' });
  });

  it('không có token thì không gửi Authorization', async () => {
    const goi = traVe(200, []);
    await goiGateway('/public/thu_tuc', {}, cauHinh, goi);
    expect(goi.mock.calls[0]![1].headers).not.toHaveProperty('Authorization');
  });

  it('mất mạng → câu trung tính, trangThai null', async () => {
    const goi = jest.fn<Promise<Response>, Parameters<HamFetch>>(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(goiGateway('/x', {}, cauHinh, goi)).rejects.toMatchObject({
      message: KHONG_KET_NOI,
      trangThai: null,
    });
  });

  it('hiện câu tiếng Việt của mot-cua-api, không hiện câu tiếng Anh của PostgREST', async () => {
    await expect(goiGateway('/x', {}, cauHinh, traVe(422, { loi: 'Thiếu giấy chứng sinh' }))).rejects.toThrow(
      'Thiếu giấy chứng sinh',
    );
    await expect(goiGateway('/x', {}, cauHinh, traVe(400, { message: 'invalid input syntax' }))).rejects.toThrow(
      'Chưa xử lý được yêu cầu (mã 400).',
    );
  });

  it('401 → hết phiên; 5xx và 429 → câu chung, không lộ chi tiết máy chủ', async () => {
    await expect(goiGateway('/x', {}, cauHinh, traVe(401, { loi: 'jwt expired' }))).rejects.toThrow(HET_PHIEN);
    await expect(goiGateway('/x', {}, cauHinh, traVe(500, { loi: 'Traceback' }))).rejects.toThrow(/bảo trì/);
    await expect(goiGateway('/x', {}, cauHinh, traVe(429, ''))).rejects.toThrow(/đợi một phút/);
  });

  it('thân rỗng hoặc không phải JSON → null', async () => {
    await expect(goiGateway('/x', { method: 'POST' }, cauHinh, traVe(204, ''))).resolves.toBeNull();
  });

  it('cauLoi: lỗi lạ không lộ thông điệp kỹ thuật', () => {
    expect(cauLoi(new LoiApi('Câu cho người dân', 400))).toBe('Câu cho người dân');
    expect(cauLoi(new Error('undefined is not a function'))).not.toMatch(/undefined/);
  });

  it('TanStack Query không thử lại lỗi 4xx, thử lại lỗi mạng tối đa 2 lần', () => {
    expect(coNenThuLai(0, new LoiApi('x', 404))).toBe(false);
    expect(coNenThuLai(0, new LoiApi('x', null))).toBe(true);
    expect(coNenThuLai(2, new LoiApi('x', 503))).toBe(false);
  });
});
