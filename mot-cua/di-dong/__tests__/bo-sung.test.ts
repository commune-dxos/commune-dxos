// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { docCauHinh } from '../src/cau-hinh/moi-truong';
import { KHONG_CON_BO_SUNG, nopBoSung, taskBoSung } from '../src/dich-vu/bo-sung';
import type { HamFetch } from '../src/dich-vu/goi-api';
import type { AnhGiayTo } from '../src/dich-vu/nop-ho-so';

const cauHinh = docCauHinh({ DXOS_GATEWAY_URL: 'http://gw.test' });
const anh = (uri: string, ten: string): AnhGiayTo => ({ uri, ten, loai: 'image/jpeg', kichThuoc: 1000 });
const docAnh = async () => new Blob(['x']);

const TASKS = [
  { id: 't-khac', buoc: 'bo_sung', ten: 'Bổ sung', hoSoId: 'hs-khac' },
  { id: 't-tiep-nhan', buoc: 'tiep_nhan', ten: 'Tiếp nhận', hoSoId: 'hs-1' },
  { id: 't-1', buoc: 'bo_sung', ten: 'Bổ sung hồ sơ', hoSoId: 'hs-1' },
];

function mayChu({ tasks = TASKS, loiTaiLan }: { tasks?: unknown[]; loiTaiLan?: number } = {}) {
  const cacLan: { url: string; init: RequestInit }[] = [];
  let soLanTai = 0;
  const goi = jest.fn<Promise<Response>, Parameters<HamFetch>>(async (url, init) => {
    cacLan.push({ url, init });
    const tra = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
    if (url.includes('/public/thanh_phan_yeu_cau')) return tra([{ id: 'tp-cmnd', ma: 'cccd' }]);
    if (url.includes('/tep?')) {
      soLanTai += 1;
      if (soLanTai === loiTaiLan) return tra({ loi: 'Tệp không phải ảnh JPG/PNG hợp lệ' }, 415);
      return tra({ id: `tep-${soLanTai}` }, 201);
    }
    if (url.endsWith('/workflow/tasks')) return tra(tasks);
    if (url.includes('/complete')) return tra({ trangThai: 'moi' });
    return tra({}, 404);
  });
  return { goi, cacLan };
}

const phuThuoc = (goi: HamFetch) => ({ layToken: async () => 'tok', docAnh, cauHinh, goi });

describe('bổ sung hồ sơ', () => {
  it('tìm đúng bước bo_sung của hồ sơ này', async () => {
    const { goi } = mayChu();
    await expect(taskBoSung('tok', 'hs-1', cauHinh, goi)).resolves.toMatchObject({ id: 't-1' });
    await expect(taskBoSung('tok', 'hs-9', cauHinh, goi)).resolves.toBeNull();
  });

  it('tải ảnh mới gắn thành phần, rồi nộp lại kèm ghi chú đã gọt', async () => {
    const { goi, cacLan } = mayChu();
    const daTai = new Set<string>();
    await nopBoSung('hs-1', 'tt-1', { cccd: [anh('file:///c1.jpg', 'cccd-1.jpg')] }, '  chụp lại bản rõ  ', daTai, phuThuoc(goi));
    const tai = cacLan.find(l => l.url.includes('/tep?'))!;
    expect(tai.url).toBe('http://gw.test/files/ho-so/hs-1/tep?ten=cccd-1.jpg&thanh_phan_yeu_cau_id=tp-cmnd');
    expect(tai.init.headers).toMatchObject({ 'Content-Type': 'image/jpeg', Authorization: 'Bearer tok' });
    const xong = cacLan.at(-1)!;
    expect(xong.url).toBe('http://gw.test/workflow/tasks/t-1/complete');
    expect(JSON.parse(xong.init.body as string)).toEqual({ bien: { ghiChu: 'chụp lại bản rõ' } });
    expect(daTai.has('file:///c1.jpg')).toBe(true);
  });

  it('không có ảnh mới vẫn nộp lại được, không gửi ghi chú rỗng', async () => {
    const { goi, cacLan } = mayChu();
    await nopBoSung('hs-1', 'tt-1', {}, '   ', new Set(), phuThuoc(goi));
    expect(cacLan.some(l => l.url.includes('/tep?') || l.url.includes('thanh_phan_yeu_cau'))).toBe(false);
    expect(JSON.parse(cacLan.at(-1)!.init.body as string)).toEqual({ bien: {} });
  });

  it('lỗi giữa chừng: bấm lại không tải trùng ảnh đã tải', async () => {
    const may = mayChu({ loiTaiLan: 2 });
    const daTai = new Set<string>();
    const ds = { cccd: [anh('file:///c1.jpg', 'cccd-1.jpg'), anh('file:///c2.jpg', 'cccd-2.jpg')] };
    await expect(nopBoSung('hs-1', 'tt-1', ds, '', daTai, phuThuoc(may.goi))).rejects.toThrow('JPG/PNG');
    expect([...daTai]).toEqual(['file:///c1.jpg']);
    await nopBoSung('hs-1', 'tt-1', ds, '', daTai, phuThuoc(may.goi));
    const cacTai = may.cacLan.filter(l => l.url.includes('/tep?')).map(l => l.url);
    expect(cacTai.filter(u => u.includes('cccd-1.jpg'))).toHaveLength(1);
    expect(cacTai.filter(u => u.includes('cccd-2.jpg'))).toHaveLength(2);
  });

  it('hồ sơ đã rời bước bổ sung: báo kéo để tải lại, không gọi complete', async () => {
    const { goi, cacLan } = mayChu({ tasks: [] });
    await expect(nopBoSung('hs-1', 'tt-1', {}, '', new Set(), phuThuoc(goi))).rejects.toMatchObject({
      message: KHONG_CON_BO_SUNG,
    });
    expect(cacLan.some(l => l.url.includes('/complete'))).toBe(false);
  });
});
