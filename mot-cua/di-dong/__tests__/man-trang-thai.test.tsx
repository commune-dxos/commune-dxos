// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { khoiTaoNgonNgu } from '../src/ngon-ngu';
import { DaiMatMang } from '../src/thanh-phan/dai-mat-mang';
import { ManTrangThai } from '../src/thanh-phan/man-trang-thai';
import { useMang } from '../src/kho/mang';

khoiTaoNgonNgu();

function chuTrong(cay: ReactTestRenderer.ReactTestRenderer) {
  return cay.root.findAll(n => (n.type as unknown) === 'Text').map(n => n.props.children).join(' ');
}

describe('màn trạng thái dùng chung', () => {
  it('màn lỗi có nút Thử lại gọi lại hàm tải', async () => {
    const thuLai = jest.fn();
    let cay!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      cay = ReactTestRenderer.create(<ManTrangThai loai="loi" tieuDe="Chưa tải được dữ liệu" onThuLai={thuLai} />);
    });
    expect(chuTrong(cay)).toContain('Thử lại');
    await ReactTestRenderer.act(async () => {
      cay.root.findByProps({ accessibilityRole: 'button' }).props.onPress();
    });
    expect(thuLai).toHaveBeenCalledTimes(1);
  });

  it('dải mất mạng chỉ hiện khi kho báo không có mạng', async () => {
    let cay!: ReactTestRenderer.ReactTestRenderer;
    useMang.setState({ coMang: true });
    await ReactTestRenderer.act(async () => {
      cay = ReactTestRenderer.create(<DaiMatMang />);
    });
    expect(cay.toJSON()).toBeNull();
    await ReactTestRenderer.act(async () => {
      useMang.setState({ coMang: false });
    });
    expect(chuTrong(cay)).toContain('không có kết nối mạng');
  });
});
