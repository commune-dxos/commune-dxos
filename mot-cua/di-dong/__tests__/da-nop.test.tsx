// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Màn "Đã nộp": nút quay về phải về màn Tab có sẵn (popTo), không đẩy thêm một Tab mới (navigate), và mã hồ sơ
// nằm trên một dòng.
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ManDaNop } from '../src/man-hinh/da-nop';
import { khoiTaoNgonNgu } from '../src/ngon-ngu';

khoiTaoNgonNgu();

async function veMan() {
  const navigation = { popTo: jest.fn(), navigate: jest.fn(), reset: jest.fn() };
  const route = {
    key: 'k',
    name: 'DaNop',
    params: { id: 'hs-1', maHoSo: 'HS20261109-000002', hanXuLy: '2026-11-12', tenThuTuc: 'Xác nhận cư trú' },
  };
  let cay!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    cay = ReactTestRenderer.create(<ManDaNop navigation={navigation as never} route={route as never} />);
  });
  return { cay, navigation };
}

const nut = (cay: ReactTestRenderer.ReactTestRenderer, nhan: string) =>
  cay.root.find(n => n.props.accessibilityRole === 'button' && n.props.accessibilityLabel === nhan);

describe('màn đã nộp', () => {
  it('"Xem hồ sơ của tôi" quay về Tab có sẵn, mở tab Hồ sơ của tôi', async () => {
    const { cay, navigation } = await veMan();
    await ReactTestRenderer.act(async () => nut(cay, 'Xem hồ sơ của tôi').props.onPress());
    expect(navigation.popTo).toHaveBeenCalledWith('Tab', { screen: 'HoSoCuaToi' });
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('"Về danh sách thủ tục" quay về Tab có sẵn, mở tab Thủ tục', async () => {
    const { cay, navigation } = await veMan();
    await ReactTestRenderer.act(async () => nut(cay, 'Về danh sách thủ tục').props.onPress());
    expect(navigation.popTo).toHaveBeenCalledWith('Tab', { screen: 'ThuTuc' });
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('mã hồ sơ một dòng, tự thu nhỏ chữ khi màn hẹp', async () => {
    const { cay } = await veMan();
    const ma = cay.root.find(n => n.props.testID === 'ma-ho-so' && n.props.children === 'HS20261109-000002');
    expect(ma.props.numberOfLines).toBe(1);
    expect(ma.props.adjustsFontSizeToFit).toBe(true);
  });
});
