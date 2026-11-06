// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { bo, chu, khoang, mau } from '../giao-dien';
import { sacTrangThai, tenTrangThai } from '../dich-vu/trang-thai';

/** Nhãn trạng thái hồ sơ: teal = hoàn tất, cam = cần chú ý (bổ sung, từ chối), chàm = đang đi. */
export function NhanTrangThai({ ma }: { ma: string }) {
  const sac = sacTrangThai(ma);
  return (
    <View style={[kieu.goc, kieu[sac]]} testID={`trang-thai-${ma}`}>
      <Text style={[kieu.chu, sac === 'xong' ? kieu.chuXong : sac === 'can-chu-y' ? kieu.chuChuY : kieu.chuDangDi]}>
        {tenTrangThai(ma)}
      </Text>
    </View>
  );
}

const kieu = StyleSheet.create({
  goc: { alignSelf: 'flex-start', borderRadius: bo.tron, paddingHorizontal: khoang.m, paddingVertical: khoang.xs },
  xong: { backgroundColor: mau.chinh },
  'can-chu-y': { backgroundColor: mau.loiNhat, borderWidth: 1, borderColor: mau.loi },
  'dang-di': { backgroundColor: mau.phu },
  chu: { fontSize: chu.nho, fontWeight: '600' },
  chuXong: { color: mau.chuTrenChinh },
  chuChuY: { color: mau.loi },
  chuDangDi: { color: mau.chuTrenPhu },
});
