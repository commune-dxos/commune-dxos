// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { docCauHinh } from '../src/cau-hinh/moi-truong';
import type { HamFetch } from '../src/dich-vu/goi-api';
import { daKetThuc, danhSachHoSo, layHoSo, lichSuHoSo, quaHan, tepCuaHoSo } from '../src/dich-vu/ho-so';

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
});
