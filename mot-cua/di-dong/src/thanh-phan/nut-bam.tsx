// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { bo, chu, khoang, mau } from '../giao-dien';

/** Nút bo tròn hẳn như cổng web mới: chính (xanh ngọc đặc), phụ (xanh ngọc nhạt), viền. */

interface Props {
  nhan: string;
  onPress: () => void;
  kieu?: 'chinh' | 'phu' | 'vien';
  dangChay?: boolean;
  tat?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  bieuTuong?: LucideIcon;
  /** Câu đọc cho trình đọc màn hình khi khác nhãn hiển thị. */
  nhanTroNang?: string;
}

export function NutBam({ nhan, onPress, kieu = 'chinh', dangChay, tat, style, testID, bieuTuong: BieuTuong, nhanTroNang }: Props) {
  const khongBam = tat || dangChay;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={nhanTroNang ?? nhan}
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
        <>
          {BieuTuong ? <BieuTuong size={22} color={kieu === 'chinh' ? mau.chuTrenChinh : mau.chuTrenChinhNhat} /> : null}
          <Text style={[kieuNut.chu, kieu === 'chinh' ? kieuNut.chuChinh : kieuNut.chuPhu]}>{nhan}</Text>
        </>
      )}
    </Pressable>
  );
}

const kieuNut = StyleSheet.create({
  goc: {
    minHeight: 54,
    borderRadius: bo.tron,
    paddingHorizontal: khoang.xl,
    paddingVertical: khoang.s,
    flexDirection: 'row',
    gap: khoang.s,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chinh: { backgroundColor: mau.chinh },
  chinhNhan: { backgroundColor: mau.chinhDam },
  phu: { backgroundColor: mau.chinhNhat },
  vien: { backgroundColor: mau.nen, borderWidth: 1.5, borderColor: mau.vienONhap },
  nhan: { backgroundColor: mau.mo },
  tat: { opacity: 0.55 },
  chu: { fontSize: chu.than, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  chuChinh: { color: mau.chuTrenChinh },
  chuPhu: { color: mau.chuTrenChinhNhat },
});
