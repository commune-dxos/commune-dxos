// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { docCauHinh } from '../src/cau-hinh/moi-truong';
import { DUONG_DAN_DANH_MUC, layDanhMucThuTuc, locThuTuc, nopTrucTuyen, type ThuTuc } from '../src/dich-vu/danh-muc';
import type { HamFetch } from '../src/dich-vu/goi-api';
import { docThanhPhan, kiemThanhPhan, type JsonSchemaHoSo } from '../src/dich-vu/thanh-phan';

const SCHEMA_KS01: JsonSchemaHoSo = {
  properties: {
    thanh_phan: {
      required: ['to_khai', 'giay_chung_sinh'],
      properties: {
        to_khai: { title: 'Tờ khai đăng ký khai sinh', minItems: 1 },
        giay_chung_sinh: { title: 'Giấy chứng sinh', description: 'Bản chính', minItems: 1 },
        giay_ket_hon_cha_me: { title: 'Giấy chứng nhận kết hôn của cha mẹ', minItems: 0, maxItems: 2 },
      },
    },
  },
};
// Validator cần đủ khai báo kiểu như schema thật của gói (thu-tuc/khai-sinh/thanh-phan-ho-so.schema.json).
const SCHEMA_DAY_DU = {
  type: 'object',
  required: ['thanh_phan'],
  properties: {
    thanh_phan: {
      type: 'object',
      additionalProperties: false,
      required: ['to_khai', 'giay_chung_sinh'],
      properties: {
        to_khai: { title: 'Tờ khai đăng ký khai sinh', type: 'array', items: { type: 'string', format: 'uuid' }, minItems: 1 },
        giay_chung_sinh: { title: 'Giấy chứng sinh', type: 'array', items: { type: 'string' }, minItems: 1 },
        giay_ket_hon_cha_me: { title: 'Giấy chứng nhận kết hôn', type: 'array', items: { type: 'string' }, maxItems: 2 },
      },
    },
  },
} as JsonSchemaHoSo;

const thuTuc = (ma: string, ten: string, linhVuc: string, quyTrinh: string | null = 'p'): ThuTuc => ({
  id: ma,
  ma,
  ten,
  so_ngay_xu_ly: 3,
  le_phi: 0,
  ghi_chu_le_phi: null,
  quy_trinh: quyTrinh,
  linh_vuc: { ma: 'x', ten: linhVuc },
  json_schema: null,
});

describe('danh mục thủ tục', () => {
  it('gọi /public/thu_tuc không token, cùng câu truy vấn với cổng công dân', async () => {
    const goi = jest.fn<Promise<Response>, Parameters<HamFetch>>(async () => new Response('[]', { status: 200 }));
    await layDanhMucThuTuc(docCauHinh({ DXOS_GATEWAY_URL: 'http://gw.test' }), goi);
    const [url, init] = goi.mock.calls[0]!;
    expect(url).toBe('http://gw.test' + DUONG_DAN_DANH_MUC);
    expect(url).toContain('json_schema');
    expect(init.headers).not.toHaveProperty('Authorization');
  });

  it('tìm không dấu theo tên, mã, lĩnh vực', () => {
    const ds = [thuTuc('KS01', 'Đăng ký khai sinh', 'Hộ tịch'), thuTuc('CT01', 'Chứng thực bản sao', 'Chứng thực')];
    expect(locThuTuc(ds, 'khai sinh').map(x => x.ma)).toEqual(['KS01']);
    expect(locThuTuc(ds, 'ct01').map(x => x.ma)).toEqual(['CT01']);
    expect(locThuTuc(ds, 'ho tich').map(x => x.ma)).toEqual(['KS01']);
    expect(locThuTuc(ds, '  ')).toHaveLength(2);
  });

  it('chỉ nộp trực tuyến khi thủ tục có quy trình', () => {
    expect(nopTrucTuyen({ quy_trinh: 'dang_ky_khai_sinh' })).toBe(true);
    expect(nopTrucTuyen({ quy_trinh: null })).toBe(false);
  });
});

describe('thành phần hồ sơ theo JSON Schema của gói', () => {
  it('đọc tên, bắt buộc, số ảnh tối thiểu', () => {
    const ds = docThanhPhan(SCHEMA_KS01);
    expect(ds.map(x => [x.ma, x.batBuoc, x.toiThieu])).toEqual([
      ['to_khai', true, 1],
      ['giay_chung_sinh', true, 1],
      ['giay_ket_hon_cha_me', false, 0],
    ]);
    expect(ds[1]!.moTa).toBe('Bản chính');
    expect(docThanhPhan(null)).toEqual([]);
  });

  it('Poka-yoke: báo thiếu từng thành phần bắt buộc, đủ thì rỗng', () => {
    expect(kiemThanhPhan(SCHEMA_DAY_DU, {})).toEqual({
      to_khai: 'Chưa có ảnh tờ khai đăng ký khai sinh',
      giay_chung_sinh: 'Chưa có ảnh giấy chứng sinh',
    });
    expect(kiemThanhPhan(SCHEMA_DAY_DU, { to_khai: 1 })).toEqual({
      giay_chung_sinh: 'Chưa có ảnh giấy chứng sinh',
    });
    expect(kiemThanhPhan(SCHEMA_DAY_DU, { to_khai: 1, giay_chung_sinh: 2 })).toEqual({});
  });

  it('Poka-yoke: quá số ảnh tối đa', () => {
    expect(kiemThanhPhan(SCHEMA_DAY_DU, { to_khai: 1, giay_chung_sinh: 1, giay_ket_hon_cha_me: 3 })).toEqual({
      giay_ket_hon_cha_me: 'Chỉ được gửi tối đa 2 ảnh cho giấy chứng nhận kết hôn',
    });
  });

  it('thủ tục chưa có schema thì không chặn', () => {
    expect(kiemThanhPhan(null, {})).toEqual({});
  });
});
