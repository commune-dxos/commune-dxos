// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { bo, chu, khoang, mau } from '../giao-dien';

interface Props {
  nhan: string;
  onPress: () => void;
  kieu?: 'chinh' | 'phu' | 'vien';
  dangChay?: boolean;
  tat?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function NutBam({ nhan, onPress, kieu = 'chinh', dangChay, tat, style, testID }: Props) {
  const khongBam = tat || dangChay;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!khongBam, busy: !!dangChay }}
      onPress={onPress}
      disabled={khongBam}
      style={({ pressed }) => [
        kieuNut.goc,
        kieuNut[kieu],
        pressed && !khongBam && (kieu === 'chinh' ? kieuNut.chinhNhan : kieuNut.nhan),
        khongBam && kieuNut.tat,
        style,
      ]}>
      {dangChay ? (
        <ActivityIndicator color={kieu === 'chinh' ? mau.chuTrenChinh : mau.chinh} />
      ) : (
        <Text style={[kieuNut.chu, kieu === 'chinh' ? kieuNut.chuChinh : kieuNut.chuPhu]}>{nhan}</Text>
      )}
    </Pressable>
  );
}

const kieuNut = StyleSheet.create({
  goc: {
    minHeight: 52,
    borderRadius: bo.vua,
    paddingHorizontal: khoang.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chinh: { backgroundColor: mau.chinh },
  chinhNhan: { backgroundColor: mau.chinhDam },
  phu: { backgroundColor: mau.chinhNhat },
  vien: { backgroundColor: mau.nen, borderWidth: 1.5, borderColor: mau.vienONhap },
  nhan: { backgroundColor: mau.mo },
  tat: { opacity: 0.55 },
  chu: { fontSize: chu.than, fontWeight: '600' },
  chuChinh: { color: mau.chuTrenChinh },
  chuPhu: { color: mau.chuTrenChinhNhat },
});
