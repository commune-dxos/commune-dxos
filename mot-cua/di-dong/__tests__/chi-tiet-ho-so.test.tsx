// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Render màn chi tiết hồ sơ với máy chủ giả: lý do bổ sung, khối nộp lại, bước đang mở, giấy tờ ký số, hết phiên.
import React from 'react';
import { Linking, ScrollView } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ManChiTietHoSo } from '../src/man-hinh/chi-tiet-ho-so';
import { khoiTaoNgonNgu } from '../src/ngon-ngu';
import { usePhien } from '../src/kho/phien-dang-nhap';

jest.mock('react-native-image-picker', () => ({ launchCamera: jest.fn(), launchImageLibrary: jest.fn() }));

khoiTaoNgonNgu();

const SCHEMA = {
  properties: {
    thanh_phan: { required: ['cccd'], properties: { cccd: { title: 'Căn cước công dân', minItems: 1 } } },
  },
};
const hoSo = (trang_thai: string, ly_do: string | null = null) => ({
  id: 'hs-1',
  ma_ho_so: 'HS20261109-000001',
  trang_thai,
  ngay_nhan: '2026-11-09T08:00:00+07:00',
  han_xu_ly: '2026-11-12',
  ngay_hoan_tat: trang_thai === 'hoan_tat' ? '2026-11-11T09:00:00+07:00' : null,
  ly_do,
  thu_tuc: { id: 'tt-1', ma: 'XAC_NHAN', ten: 'Xác nhận tình trạng cư trú', so_ngay_xu_ly: 3, json_schema: SCHEMA },
});

type Dong = { url: string; init?: RequestInit };
let cacLan: Dong[] = [];

/** Máy chủ giả qua global fetch; `hs` là hồ sơ trả về, `tra401` cho mọi lời gọi có token trả 401. */
function mayChu(hs: ReturnType<typeof hoSo>, { tra401 = false } = {}) {
  cacLan = [];
  globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    cacLan.push({ url, init });
    const tra = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
    if (tra401) return tra({ message: 'JWT expired' }, 401);
    if (url.includes('/api/ho_so')) return tra([hs]);
    if (url.includes('/api/lich_su_trang_thai')) {
      return tra([
        { den_trang_thai: 'moi', ly_do: null, luc: '2026-11-09T08:00:00+07:00' },
        { den_trang_thai: hs.trang_thai, ly_do: hs.ly_do, luc: '2026-11-10T08:00:00+07:00' },
      ]);
    }
    if (url.endsWith('/tep')) {
      return tra([
        { id: 'f1', thanh_phan_yeu_cau_id: 'tp-cccd', ten_tep: 'cccd-1.jpg', loai_mime: 'image/jpeg', kich_thuoc: 204800, ket_qua_quet: 'sach', created_at: '' },
      ]);
    }
    if (url.includes('/tien-do')) {
      return tra({ quyTrinh: [{ processInstanceId: 'p', ketThuc: null, buocDangMo: [{ id: 'k', buoc: 'bo_sung', ten: 'Công dân bổ sung' }], lichSu: [] }] });
    }
    if (url.includes('/public/thanh_phan_yeu_cau')) return tra([{ id: 'tp-cccd', ma: 'cccd' }]);
    if (url.endsWith('/workflow/tasks')) return tra([{ id: 't-1', buoc: 'bo_sung', ten: 'Bổ sung', hoSoId: 'hs-1' }]);
    if (url.includes('/complete')) return tra({ trangThai: 'moi' });
    if (url.includes('/giay-to/')) {
      return tra({
        id: 'g', loai: url.endsWith('ket_qua') ? 'ket_qua' : 'bien_nhan', sha256: 'x', kich_thuoc: 1, chung_thu_ten: 'UBND xã Mẫu',
        ky_luc: '', maHoSo: hs.ma_ho_so, link: 'https://commune.test/files/s3/kq.pdf?sig=1', hetHanLuc: '',
      }, 201);
    }
    return tra({}, 404);
  }) as unknown as typeof fetch;
}

const chuTrong = (cay: ReactTestRenderer.ReactTestRenderer) =>
  cay.root
    .findAll(n => (n.type as unknown) === 'Text')
    .map(n => [n.props.children].flat().join(''))
    .join(' | ');

async function veMan() {
  const bo = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  let cay!: ReactTestRenderer.ReactTestRenderer;
  const route = { key: 'k', name: 'ChiTietHoSo', params: { id: 'hs-1' } } as never;
  await ReactTestRenderer.act(async () => {
    cay = ReactTestRenderer.create(
      <QueryClientProvider client={bo}>
        <ManChiTietHoSo navigation={undefined as never} route={route} />
      </QueryClientProvider>,
    );
  });
  dangVe.push(cay);
  // Chờ các truy vấn (fetch giả trả ngay) xong.
  for (let i = 0; i < 5; i += 1) {
    await ReactTestRenderer.act(async () => {
      await new Promise<void>(r => setTimeout(() => r(), 0));
    });
  }
  return cay;
}

async function bam(cay: ReactTestRenderer.ReactTestRenderer, testID: string) {
  await ReactTestRenderer.act(async () => {
    cay.root.find(n => n.props.testID === testID && typeof n.props.onPress === 'function').props.onPress();
  });
  for (let i = 0; i < 5; i += 1) {
    await ReactTestRenderer.act(async () => {
      await new Promise<void>(r => setTimeout(() => r(), 0));
    });
  }
}

const dangVe: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  ReactTestRenderer.act(() => dangVe.splice(0).forEach(c => c.unmount()));
});

beforeEach(() => {
  usePhien.setState({
    phien: { accessToken: 'tok', refreshToken: null, idToken: null, hetHan: new Date(Date.now() + 600_000).toISOString() },
    nguoiDung: { ten: 'Công dân thử' } as never,
    dangKhoiPhuc: false,
    dangXuLy: false,
    loi: null,
  });
});

describe('màn chi tiết hồ sơ', () => {
  it('chờ bổ sung: hiện yêu cầu, bước đang mở, nộp lại ngay trên app', async () => {
    mayChu(hoSo('cho_bo_sung', 'Ảnh căn cước bị mờ, chụp lại mặt sau'));
    const cay = await veMan();
    const chu = chuTrong(cay);
    expect(chu).toContain('Ảnh căn cước bị mờ, chụp lại mặt sau');
    expect(chu).toContain('Công dân bổ sung');
    expect(chu).toContain('Đã nộp 1 tệp');
    expect(cay.root.findAllByProps({ testID: 'nut-giay-to-bien_nhan' }).length).toBeGreaterThan(0);
    expect(cay.root.findAllByProps({ testID: 'nut-giay-to-ket_qua' })).toHaveLength(0);

    const cuon = cay.root.findByType(ScrollView).instance as { scrollTo: jest.Mock };
    cuon.scrollTo.mockClear();
    await bam(cay, 'nut-nop-lai');
    // Thông báo "Đã nộp lại" ở đầu trang: màn phải cuộn lên đầu.
    expect(cuon.scrollTo).toHaveBeenCalledWith({ y: 0, animated: true });
    const complete = cacLan.find(l => l.url.includes('/workflow/tasks/t-1/complete'));
    expect(complete?.init?.method).toBe('POST');
    expect(chuTrong(cay)).toContain('Đã nộp lại hồ sơ');
  });

  it('hoàn tất: tải thông báo kết quả ký số, mở link bằng trình duyệt', async () => {
    const mo = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    mayChu(hoSo('hoan_tat'));
    const cay = await veMan();
    expect(chuTrong(cay)).toContain('Hồ sơ đã có kết quả');
    await bam(cay, 'nut-giay-to-ket_qua');
    expect(cacLan.some(l => l.url.endsWith('/files/ho-so/hs-1/giay-to/ket_qua') && l.init?.method === 'POST')).toBe(true);
    expect(mo).toHaveBeenCalledWith('https://commune.test/files/s3/kq.pdf?sig=1');
    expect(chuTrong(cay)).toContain('Đã ký số bởi UBND xã Mẫu');
  });

  it('từ chối: hiện lý do không giải quyết, không có khối bổ sung', async () => {
    mayChu(hoSo('tu_choi', 'Không thuộc thẩm quyền của xã'));
    const cay = await veMan();
    expect(chuTrong(cay)).toContain('Lý do không giải quyết');
    expect(chuTrong(cay)).toContain('Không thuộc thẩm quyền của xã');
    expect(cay.root.findAllByProps({ testID: 'khoi-bo-sung' })).toHaveLength(0);
  });

  it('máy chủ báo 401: bỏ phiên, hiện đăng nhập lại kèm câu hết phiên', async () => {
    mayChu(hoSo('dang_xu_ly'), { tra401: true });
    const cay = await veMan();
    expect(cay.root.findAllByProps({ testID: 'yeu-cau-dang-nhap' }).length).toBeGreaterThan(0);
    expect(chuTrong(cay)).toContain('Phiên đăng nhập đã hết hạn');
  });
});
