// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { chuanHoa, lePhi, ngay, thoiHan } from '../src/dich-vu/dinh-dang';
import { sacTrangThai, tenTrangThai } from '../src/dich-vu/trang-thai';

describe('định dạng cho người dân', () => {
  it('thời hạn và lệ phí', () => {
    expect(thoiHan(0)).toBe('Trong ngày');
    expect(thoiHan(5)).toBe('5 ngày làm việc');
    expect(lePhi(0)).toBe('Miễn phí');
    expect(lePhi(1500000)).toBe('1.500.000 đồng');
  });

  it('ngày YYYY-MM-DD → dd/mm/yyyy, không đổi múi giờ', () => {
    expect(ngay('2026-11-06')).toBe('06/11/2026');
    expect(ngay(null)).toBe('');
  });

  it('tìm không dấu', () => {
    expect(chuanHoa('Đăng ký khai sinh')).toBe('dang ky khai sinh');
  });

  it('trạng thái hồ sơ: tên hiển thị và sắc nhãn', () => {
    expect(tenTrangThai('cho_bo_sung')).toBe('Chờ công dân bổ sung');
    expect(tenTrangThai('trang_thai_moi')).toBe('trang_thai_moi');
    expect(sacTrangThai('hoan_tat')).toBe('xong');
    expect(sacTrangThai('tu_choi')).toBe('can-chu-y');
    expect(sacTrangThai('dang_xu_ly')).toBe('dang-di');
  });
});
