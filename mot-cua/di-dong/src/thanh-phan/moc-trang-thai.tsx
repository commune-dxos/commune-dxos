// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { chu, khoang, mau } from '../giao-dien';
import { ngayGio } from '../dich-vu/dinh-dang';
import { tenTrangThai } from '../dich-vu/trang-thai';

export interface Moc {
  trangThai: string;
  luc: string;
  lyDo?: string | null;
}

/** Các mốc chuyển trạng thái của hồ sơ, mốc mới nhất ở trên. */
export function MocTrangThai({ cacMoc }: { cacMoc: Moc[] }) {
  const ds = [...cacMoc].reverse();
  return (
    <View accessibilityRole="list">
      {ds.map((m, i) => (
        <View key={`${m.luc}-${i}`} style={kieu.dong}>
          <View style={kieu.cotTrai}>
            <View style={[kieu.cham, i === 0 && kieu.chamMoi]} />
            {i < ds.length - 1 ? <View style={kieu.duong} /> : null}
          </View>
          <View style={kieu.cotPhai}>
            <Text style={[kieu.ten, i === 0 && kieu.tenMoi]}>{tenTrangThai(m.trangThai)}</Text>
            <Text style={kieu.luc}>{ngayGio(m.luc)}</Text>
            {m.lyDo ? <Text style={kieu.lyDo}>{m.lyDo}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const kieu = StyleSheet.create({
  dong: { flexDirection: 'row', gap: khoang.m },
  cotTrai: { alignItems: 'center', width: 16 },
  cham: { width: 12, height: 12, borderRadius: 6, backgroundColor: mau.vienONhap, marginTop: 6 },
  chamMoi: { backgroundColor: mau.chinh, width: 16, height: 16, borderRadius: 8, marginTop: 4 },
  duong: { flex: 1, width: 2, backgroundColor: mau.vien, marginVertical: 2 },
  cotPhai: { flex: 1, paddingBottom: khoang.l, gap: 2 },
  ten: { fontSize: chu.than, color: mau.chu },
  tenMoi: { fontWeight: '700' },
  luc: { fontSize: chu.nho, color: mau.chuMo },
  lyDo: { fontSize: chu.nho, color: mau.chu, marginTop: 2 },
});
