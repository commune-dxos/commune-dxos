// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { docCauHinh } from '../src/cau-hinh/moi-truong';
import type { HamFetch } from '../src/dich-vu/goi-api';
import {
  LoiThieuThanhPhan,
  kiemNguoiNop,
  nopHoSo,
  thanhAnhGiayTo,
  tienDoMoi,
  type AnhGiayTo,
} from '../src/dich-vu/nop-ho-so';
import type { JsonSchemaHoSo } from '../src/dich-vu/thanh-phan';

const cauHinh = docCauHinh({ DXOS_GATEWAY_URL: 'http://gw.test' });
const mang = (o: object) => ({ type: 'array', items: { type: 'string' }, ...o });
const SCHEMA = {
  type: 'object',
  required: ['thanh_phan'],
  properties: {
    thanh_phan: {
      type: 'object',
      required: ['to_khai', 'giay_chung_sinh'],
      properties: {
        to_khai: mang({ title: 'Tờ khai', minItems: 1 }),
        giay_chung_sinh: mang({ title: 'Giấy chứng sinh', minItems: 1 }),
      },
    },
  },
} as JsonSchemaHoSo;
const THU_TUC = { id: 'tt-ks01', json_schema: SCHEMA };
const NGUOI_NOP = { hoTen: ' Nguyễn Văn An ', soDienThoai: '0912 345 678' };
const anh = (uri: string, ten: string): AnhGiayTo => ({ uri, ten, loai: 'image/jpeg', kichThuoc: 1000 });
const ANH = {
  to_khai: [anh('file:///a1.jpg', 'to_khai-1.jpg')],
  giay_chung_sinh: [anh('file:///b1.jpg', 'giay_chung_sinh-2.jpg'), anh('file:///b2.jpg', 'giay_chung_sinh-3.jpg')],
};

/** Máy chủ giả: ghi lại từng request, có thể cho một bước lỗi. */
function mayChu(loiO?: (url: string, lan: number) => Response | null) {
  const cacLan: { url: string; init: RequestInit }[] = [];
  const goi = jest.fn<Promise<Response>, Parameters<HamFetch>>(async (url, init) => {
    cacLan.push({ url, init });
    const loi = loiO?.(url, cacLan.length);
    if (loi) return loi;
    const tra = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
    if (url.includes('/api/ho_so')) {
      return tra([{ id: 'hs-1', ma_ho_so: 'HS20261106-000001', trang_thai: 'moi', han_xu_ly: '2026-11-11' }], 201);
    }
    if (url.includes('/public/thanh_phan_yeu_cau')) {
      return tra([
        { id: 'tp-1', ma: 'to_khai' },
        { id: 'tp-2', ma: 'giay_chung_sinh' },
      ]);
    }
    if (url.includes('/tep?')) return tra({ id: `tep-${cacLan.length}` }, 201);
    if (url.includes('/khoi-tao')) return tra({ processInstanceId: 'p1' });
    return tra({}, 404);
  });
  return { goi, cacLan };
}

const docAnh = jest.fn(async (uri: string) => ({ uri } as unknown as Blob));

describe('nộp hồ sơ', () => {
  beforeEach(() => docAnh.mockClear());

  it('đúng thứ tự: tạo hồ sơ → tải từng ảnh theo thành phần → khởi tạo quy trình', async () => {
    const { goi, cacLan } = mayChu();
    const layToken = jest.fn(async () => 'tok');
    const hoSo = await nopHoSo(THU_TUC, NGUOI_NOP, ANH, tienDoMoi(), { layToken, docAnh, cauHinh, goi });
    expect(hoSo.ma_ho_so).toBe('HS20261106-000001');
    expect(cacLan.map(l => `${l.init.method} ${l.url.replace('http://gw.test', '').split('?')[0]}`)).toEqual([
      'POST /api/ho_so',
      'GET /public/thanh_phan_yeu_cau',
      'POST /files/ho-so/hs-1/tep',
      'POST /files/ho-so/hs-1/tep',
      'POST /files/ho-so/hs-1/tep',
      'POST /workflow/ho-so/hs-1/khoi-tao',
    ]);
    // Thân tạo hồ sơ: họ tên đã cắt khoảng trắng, số điện thoại bỏ dấu cách (CHECK '^0[0-9]{9}$').
    expect(JSON.parse(cacLan[0]!.init.body as string)).toEqual({
      thu_tuc_id: 'tt-ks01',
      ho_ten_nguoi_nop: 'Nguyễn Văn An',
      so_dien_thoai: '0912345678',
    });
    expect(cacLan[0]!.init.headers).toMatchObject({ Prefer: 'return=representation', Authorization: 'Bearer tok' });
    // Ảnh gửi thẳng làm thân request, tên theo mã thành phần, kèm id thành phần yêu cầu.
    expect(cacLan[2]!.url).toBe('http://gw.test/files/ho-so/hs-1/tep?ten=to_khai-1.jpg&thanh_phan_yeu_cau_id=tp-1');
    expect(cacLan[2]!.init.headers).toMatchObject({ 'Content-Type': 'image/jpeg' });
    expect(cacLan[2]!.init.body).toEqual({ uri: 'file:///a1.jpg' });
    // Danh mục thành phần đọc công khai, không token.
    expect(cacLan[1]!.init.headers).not.toHaveProperty('Authorization');
    // Lấy token trước mỗi request cần đăng nhập (tải ảnh lâu thì token được làm mới).
    expect(layToken).toHaveBeenCalledTimes(5);
  });

  it('Poka-yoke: thiếu giấy tờ bắt buộc thì không gửi request nào', async () => {
    const { goi } = mayChu();
    const loi = await nopHoSo(THU_TUC, NGUOI_NOP, { to_khai: ANH.to_khai }, tienDoMoi(), {
      layToken: async () => 'tok',
      docAnh,
      cauHinh,
      goi,
    }).catch(e => e);
    expect(loi).toBeInstanceOf(LoiThieuThanhPhan);
    expect(loi.thanhPhan).toEqual({ giay_chung_sinh: 'Chưa có ảnh giấy chứng sinh' });
    expect(goi).not.toHaveBeenCalled();
  });

  it('lỗi giữa chừng rồi Thử lại: không tạo trùng hồ sơ, không tải lại ảnh đã gửi', async () => {
    let hong = true;
    const { goi, cacLan } = mayChu((url, lan) =>
      hong && url.includes('/tep?') && lan === 4 ? new Response('{}', { status: 503 }) : null,
    );
    const tienDo = tienDoMoi();
    const phu = { layToken: async () => 'tok', docAnh, cauHinh, goi };
    await expect(nopHoSo(THU_TUC, NGUOI_NOP, ANH, tienDo, phu)).rejects.toMatchObject({ trangThai: 503 });
    expect(tienDo.hoSo?.id).toBe('hs-1');
    expect([...tienDo.daTai]).toEqual(['file:///a1.jpg']);
    hong = false;
    const truoc = cacLan.length;
    await nopHoSo(THU_TUC, NGUOI_NOP, ANH, tienDo, phu);
    const sau = cacLan.slice(truoc).map(l => l.url.replace('http://gw.test', '').split('?')[0]);
    expect(sau).toEqual([
      '/public/thanh_phan_yeu_cau',
      '/files/ho-so/hs-1/tep',
      '/files/ho-so/hs-1/tep',
      '/workflow/ho-so/hs-1/khoi-tao',
    ]);
    expect(cacLan.filter(l => l.url.includes('/api/ho_so'))).toHaveLength(1);
  });

  it('khởi tạo trả 409 "đã có quy trình" (lần trước mất phản hồi) → coi là thành công', async () => {
    const { goi } = mayChu(url =>
      url.includes('/khoi-tao') ? new Response(JSON.stringify({ loi: 'Hồ sơ đã có quy trình' }), { status: 409 }) : null,
    );
    const tienDo = tienDoMoi();
    await nopHoSo(THU_TUC, NGUOI_NOP, ANH, tienDo, { layToken: async () => 'tok', docAnh, cauHinh, goi });
    expect(tienDo.daKhoiTao).toBe(true);
  });

  it('máy chủ báo thiếu thành phần (422) thì hiện nguyên câu tiếng Việt', async () => {
    const { goi } = mayChu(url =>
      url.includes('/khoi-tao')
        ? new Response(JSON.stringify({ loi: 'Hồ sơ chưa đủ thành phần: Giấy chứng sinh' }), { status: 422 })
        : null,
    );
    await expect(
      nopHoSo(THU_TUC, NGUOI_NOP, ANH, tienDoMoi(), { layToken: async () => 'tok', docAnh, cauHinh, goi }),
    ).rejects.toThrow('Hồ sơ chưa đủ thành phần: Giấy chứng sinh');
  });
});

describe('kiểm người nộp và ảnh', () => {
  it('số điện thoại 10 số bắt đầu bằng 0, cho phép dấu cách', () => {
    expect(kiemNguoiNop(NGUOI_NOP)).toEqual({});
    expect(kiemNguoiNop({ hoTen: '', soDienThoai: '' })).toEqual({
      hoTen: expect.any(String),
      soDienThoai: 'Nhập số điện thoại.',
    });
    expect(kiemNguoiNop({ hoTen: 'A', soDienThoai: '84912345678' }).soDienThoai).toMatch(/10 chữ số/);
  });

  it('ảnh từ image-picker: đặt tên theo mã thành phần, chỉ nhận JPG/PNG dưới 10 MB', () => {
    expect(thanhAnhGiayTo({ uri: 'content://x', type: 'image/jpeg', fileSize: 500 }, 'to_khai', 3)).toEqual({
      uri: 'content://x',
      ten: 'to_khai-3.jpg',
      loai: 'image/jpeg',
      kichThuoc: 500,
    });
    expect(thanhAnhGiayTo({ uri: 'content://y', type: 'image/png' }, 'cccd', 1)).toMatchObject({ ten: 'cccd-1.png' });
    expect(thanhAnhGiayTo({ uri: 'content://z', type: 'image/heic' }, 'cccd', 1)).toEqual({
      loi: 'Chỉ nhận ảnh JPG hoặc PNG.',
    });
    expect(thanhAnhGiayTo({ uri: 'content://z', type: 'image/jpeg', fileSize: 11 * 1024 * 1024 }, 'cccd', 1)).toHaveProperty(
      'loi',
    );
  });
});
