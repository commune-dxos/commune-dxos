// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { docCauHinh } from '../src/cau-hinh/moi-truong';
import { coGiayTo, linkTuyetDoi, phatHanhGiayTo, taiGiayTo } from '../src/dich-vu/giay-to';
import type { HamFetch } from '../src/dich-vu/goi-api';

const cauHinh = docCauHinh({ DXOS_GATEWAY_URL: 'http://gw.test' });
const GIAY_TO = {
  id: 'g1',
  loai: 'bien_nhan',
  sha256: 'ab',
  kich_thuoc: 1234,
  chung_thu_ten: 'UBND xã Mẫu',
  ky_luc: '2026-11-09T08:00:00+07:00',
  maHoSo: 'HS20261109-000001',
  link: 'http://gw.test/files/s3/giay-to/g1.pdf?X-Amz-Signature=x',
  hetHanLuc: '2026-11-09T08:05:00+07:00',
};

function goiTra(than: unknown, status = 200) {
  return jest.fn<Promise<Response>, Parameters<HamFetch>>(
    async () => new Response(JSON.stringify(than), { status }),
  );
}

describe('giấy tờ có ký số', () => {
  it('phát hành: POST /files/ho-so/{id}/giay-to/{loai} bằng token công dân', async () => {
    const goi = goiTra(GIAY_TO, 201);
    await expect(phatHanhGiayTo('tok', 'hs 1', 'ket_qua', cauHinh, goi)).resolves.toMatchObject({ id: 'g1' });
    const [url, init] = goi.mock.calls[0]!;
    expect(url).toBe('http://gw.test/files/ho-so/hs%201/giay-to/ket_qua');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok' });
  });

  it('link tương đối thì ghép với cổng của app', () => {
    expect(linkTuyetDoi('/files/s3/a.pdf', cauHinh)).toBe('http://gw.test/files/s3/a.pdf');
    expect(linkTuyetDoi('files/s3/a.pdf', cauHinh)).toBe('http://gw.test/files/s3/a.pdf');
    expect(linkTuyetDoi('https://khac.test/a.pdf', cauHinh)).toBe('https://khac.test/a.pdf');
  });

  it('biên nhận luôn có nút; kết quả chỉ khi hoàn tất', () => {
    expect(coGiayTo('moi', 'bien_nhan')).toBe(true);
    expect(coGiayTo('dang_xu_ly', 'ket_qua')).toBe(false);
    expect(coGiayTo('tu_choi', 'ket_qua')).toBe(false);
    expect(coGiayTo('hoan_tat', 'ket_qua')).toBe(true);
  });

  it('tải: phát hành rồi mở link bằng trình duyệt của máy', async () => {
    const mo = jest.fn(async () => true);
    const g = await taiGiayTo(async () => 'tok', 'hs1', 'bien_nhan', mo, cauHinh, goiTra(GIAY_TO));
    expect(g.chung_thu_ten).toBe('UBND xã Mẫu');
    expect(mo).toHaveBeenCalledWith(GIAY_TO.link);
  });

  it('chưa vào quy trình (409): hiện nguyên câu tiếng Việt của máy chủ, không mở link', async () => {
    const mo = jest.fn(async () => true);
    const goi = goiTra({ loi: 'Hồ sơ chưa được tiếp nhận vào quy trình' }, 409);
    await expect(taiGiayTo(async () => 'tok', 'hs1', 'bien_nhan', mo, cauHinh, goi)).rejects.toMatchObject({
      trangThai: 409,
      message: 'Hồ sơ chưa được tiếp nhận vào quy trình',
    });
    expect(mo).not.toHaveBeenCalled();
  });

  it('máy không mở được link: câu hướng dẫn cài trình duyệt / ứng dụng đọc PDF', async () => {
    const mo = jest.fn(async () => {
      throw new Error('No Activity found');
    });
    await expect(taiGiayTo(async () => 'tok', 'hs1', 'bien_nhan', mo, cauHinh, goiTra(GIAY_TO))).rejects.toThrow(
      /ứng dụng đọc PDF/,
    );
  });
});
