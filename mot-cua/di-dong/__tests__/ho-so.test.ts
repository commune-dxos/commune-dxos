// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { docCauHinh } from '../src/cau-hinh/moi-truong';
import type { HamFetch } from '../src/dich-vu/goi-api';
import { LoiApi } from '../src/dich-vu/goi-api';
import {
  buocDangMo,
  daKetThuc,
  danhSachHoSo,
  layHoSo,
  lichSuHoSo,
  quaHan,
  tepCuaHoSo,
  tienDoHoSo,
  voiPhien,
} from '../src/dich-vu/ho-so';
import { usePhien } from '../src/kho/phien-dang-nhap';

const cauHinh = docCauHinh({ DXOS_GATEWAY_URL: 'http://gw.test' });

function goiTra(than: unknown, status = 200) {
  return jest.fn<Promise<Response>, Parameters<HamFetch>>(
    async () => new Response(JSON.stringify(than), { status }),
  );
}

describe('hồ sơ của tôi', () => {
  it('danh sách: PostgREST /api/ho_so bằng token công dân, mới nhất trước, kèm thủ tục', async () => {
    const goi = goiTra([]);
    await danhSachHoSo('tok', cauHinh, goi);
    const [url, init] = goi.mock.calls[0]!;
    expect(url).toMatch(/^http:\/\/gw\.test\/api\/ho_so\?select=id,ma_ho_so,trang_thai,/);
    expect(url).toContain('thu_tuc:thu_tuc_id(');
    expect(url).toContain('order=ngay_nhan.desc');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok' });
  });

  it('một hồ sơ: lọc theo id, không có thì null', async () => {
    const goi = goiTra([]);
    await expect(layHoSo('tok', 'a b', cauHinh, goi)).resolves.toBeNull();
    expect(goi.mock.calls[0]![0]).toContain('/api/ho_so?id=eq.a%20b&');
  });

  it('các mốc trạng thái và giấy tờ đã nộp', async () => {
    const goi = goiTra([]);
    await lichSuHoSo('tok', 'id1', cauHinh, goi);
    await tepCuaHoSo('tok', 'id1', cauHinh, goi);
    expect(goi.mock.calls[0]![0]).toBe(
      'http://gw.test/api/lich_su_trang_thai?ho_so_id=eq.id1&select=den_trang_thai,ly_do,luc&order=id',
    );
    expect(goi.mock.calls[1]![0]).toBe('http://gw.test/files/ho-so/id1/tep');
  });

  it('token hết hạn phía máy chủ → câu hết phiên', async () => {
    await expect(danhSachHoSo('tok', cauHinh, goiTra({ message: 'JWT expired' }, 401))).rejects.toMatchObject({
      trangThai: 401,
      message: expect.stringContaining('đăng nhập lại'),
    });
  });

  it('quá hạn chỉ tính hồ sơ chưa kết thúc', () => {
    const homNay = new Date(2026, 10, 6);
    expect(quaHan({ trang_thai: 'dang_xu_ly', han_xu_ly: '2026-11-05' }, homNay)).toBe(true);
    expect(quaHan({ trang_thai: 'dang_xu_ly', han_xu_ly: '2026-11-06' }, homNay)).toBe(false);
    expect(quaHan({ trang_thai: 'hoan_tat', han_xu_ly: '2026-11-01' }, homNay)).toBe(false);
    expect(quaHan({ trang_thai: 'moi', han_xu_ly: null }, homNay)).toBe(false);
    expect(daKetThuc({ trang_thai: 'tu_choi' })).toBe(true);
  });

  it('danh sách xin kèm JSON Schema của thủ tục để màn bổ sung biết các thành phần', async () => {
    const goi = goiTra([]);
    await danhSachHoSo('tok', cauHinh, goi);
    expect(goi.mock.calls[0]![0]).toContain('thu_tuc:thu_tuc_id(id,ma,ten,so_ngay_xu_ly,json_schema)');
  });

  it('tiến độ quy trình: GET /workflow/ho-so/{id}/tien-do, gộp tên bước đang mở không trùng', async () => {
    const goi = goiTra({ quyTrinh: [] });
    await tienDoHoSo('tok', 'id1', cauHinh, goi);
    expect(goi.mock.calls[0]![0]).toBe('http://gw.test/workflow/ho-so/id1/tien-do');
    const p = (ten: string[]) => ({
      processInstanceId: 'p',
      ketThuc: null,
      buocDangMo: ten.map((x, i) => ({ id: `${i}`, buoc: `b${i}`, ten: x })),
      lichSu: [],
    });
    expect(buocDangMo({ quyTrinh: [p(['Thẩm định']), p(['Thẩm định', 'Phê duyệt'])] })).toEqual(['Thẩm định', 'Phê duyệt']);
    expect(buocDangMo(null)).toEqual([]);
  });
});

describe('gọi API bằng phiên', () => {
  const phien = { accessToken: 'tok-1', refreshToken: null, idToken: null, hetHan: new Date(Date.now() + 600_000).toISOString() };
  beforeEach(() => usePhien.setState({ phien, nguoiDung: null, dangKhoiPhuc: false, loi: null }));

  it('dùng access token còn hạn của phiên', async () => {
    await expect(voiPhien(async token => token)).resolves.toBe('tok-1');
    expect(usePhien.getState().phien).not.toBeNull();
  });

  it('máy chủ trả 401 (token bị thu hồi): bỏ phiên, báo hết phiên ở màn đăng nhập', async () => {
    await expect(
      voiPhien(async () => {
        throw new LoiApi('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 401);
      }),
    ).rejects.toMatchObject({ trangThai: 401 });
    expect(usePhien.getState().phien).toBeNull();
    expect(usePhien.getState().loi).toMatch(/hết hạn/);
  });

  it('lỗi khác (mất mạng, 5xx) giữ nguyên phiên', async () => {
    await expect(
      voiPhien(async () => {
        throw new LoiApi('Chưa kết nối được tới máy chủ.', null);
      }),
    ).rejects.toBeInstanceOf(LoiApi);
    expect(usePhien.getState().phien).not.toBeNull();
  });
});
