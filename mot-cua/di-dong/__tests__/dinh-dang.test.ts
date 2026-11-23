// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { chuanHoa, lePhi, ngay, ngayGio, thoiHan } from '../src/dich-vu/dinh-dang';
import { sacTrangThai, tenTrangThai } from '../src/dich-vu/trang-thai';

describe('định dạng cho người dân', () => {
  it('thời hạn và lệ phí', () => {
    expect(thoiHan(0)).toBe('Trong ngày');
    expect(thoiHan(1)).toBe('1 ngày làm việc');
    expect(thoiHan(5)).toBe('5 ngày làm việc');
    expect(thoiHan(15)).toBe('15 ngày làm việc');
    expect(lePhi(0)).toBe('Miễn phí');
    expect(lePhi(2000)).toBe('2.000 đồng');
    expect(lePhi(1500000)).toBe('1.500.000 đồng');
    expect(lePhi(12500.6)).toBe('12.501 đồng');
  });

  it('ngày YYYY-MM-DD → dd/mm/yyyy, không đổi múi giờ', () => {
    expect(ngay('2026-11-06')).toBe('06/11/2026');
    expect(ngay(null)).toBe('');
    expect(ngay(undefined)).toBe('');
    expect(ngay('')).toBe('');
    expect(ngay('06/11/2026')).toBe('06/11/2026');
  });

  it('thời điểm timestamptz → hh:mm dd/mm/yyyy hoặc giữ nguyên nếu chuỗi lỗi', () => {
    expect(ngayGio(null)).toBe('');
    expect(ngayGio(undefined)).toBe('');
    expect(ngayGio('khong-phai-ngay')).toBe('khong-phai-ngay');
    expect(ngayGio('2026-11-06T08:05:00Z')).toMatch(/^\d{2}:\d{2} \d{2}\/\d{2}\/2026$/);
  });

  it('tìm không dấu', () => {
    expect(chuanHoa('Đăng ký khai sinh')).toBe('dang ky khai sinh');
    expect(chuanHoa('  Đất đai và đo đạc  ')).toBe('dat dai va do dac');
  });

  it('trạng thái hồ sơ: tên hiển thị và sắc nhãn', () => {
    expect(tenTrangThai('cho_bo_sung')).toBe('Chờ công dân bổ sung');
    expect(tenTrangThai('trang_thai_moi')).toBe('trang_thai_moi');
    expect(sacTrangThai('hoan_tat')).toBe('xong');
    expect(sacTrangThai('tu_choi')).toBe('can-chu-y');
    expect(sacTrangThai('dang_xu_ly')).toBe('dang-di');
  });
});
