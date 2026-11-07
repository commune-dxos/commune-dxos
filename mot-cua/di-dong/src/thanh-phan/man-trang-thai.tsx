// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Màn đang tải, lỗi, trống dùng chung. Câu chữ trung tính: nói điều đang xảy ra và việc người dân làm
// tiếp được, không đổ lỗi cho người dùng.
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { CircleAlert, Inbox, WifiOff } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { chu, khoang, mau } from '../giao-dien';
import { NutBam } from './nut-bam';

interface Props {
  loai: 'dang-tai' | 'loi' | 'trong' | 'mat-mang';
  tieuDe?: string;
  moTa?: string;
  onThuLai?: () => void;
  nhanNut?: string;
}

export function ManTrangThai({ loai, tieuDe, moTa, onThuLai, nhanNut }: Props) {
  const { t } = useTranslation();
  if (loai === 'dang-tai') {
    return (
      <View style={kieu.goc} accessibilityLiveRegion="polite" testID="man-dang-tai">
        <ActivityIndicator size="large" color={mau.chinh} />
        <Text style={kieu.moTa}>{tieuDe ?? t('chung.dangTai')}</Text>
      </View>
    );
  }
  const BieuTuong = loai === 'trong' ? Inbox : loai === 'mat-mang' ? WifiOff : CircleAlert;
  return (
    <View style={kieu.goc} testID={`man-${loai}`}>
      <View style={[kieu.vong, loai === 'loi' && kieu.vongLoi]}>
        <BieuTuong size={30} color={loai === 'loi' ? mau.loi : mau.chinh} />
      </View>
      {tieuDe ? (
        <Text style={kieu.tieuDe} accessibilityRole="header">
          {tieuDe}
        </Text>
      ) : null}
      {moTa ? <Text style={kieu.moTa}>{moTa}</Text> : null}
      {onThuLai ? (
        <NutBam nhan={nhanNut ?? t('chung.thuLai')} kieu="vien" onPress={onThuLai} style={kieu.nut} />
      ) : null}
    </View>
  );
}

const kieu = StyleSheet.create({
  goc: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: khoang.xxl, gap: khoang.m },
  vong: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: mau.chinhNhat,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vongLoi: { backgroundColor: mau.loiNhat },
  tieuDe: { fontSize: chu.lon, fontWeight: '700', color: mau.chu, textAlign: 'center' },
  moTa: { fontSize: chu.than, color: mau.chuMo, textAlign: 'center', lineHeight: 26 },
  nut: { marginTop: khoang.s, alignSelf: 'stretch' },
});
