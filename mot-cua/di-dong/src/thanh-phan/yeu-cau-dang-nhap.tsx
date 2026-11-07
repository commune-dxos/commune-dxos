// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LogIn } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { chu, khoang, mau } from '../giao-dien';
import { usePhien } from '../kho/phien-dang-nhap';
import { NutBam } from './nut-bam';

/** Thay cho nội dung cần đăng nhập: nói vì sao cần và cho đăng nhập ngay tại chỗ. */
export function YeuCauDangNhap({ moTa }: { moTa: string }) {
  const { t } = useTranslation();
  const { dangNhap, dangXuLy, loi } = usePhien();
  return (
    <View style={kieu.goc} testID="yeu-cau-dang-nhap">
      <View style={kieu.vong}>
        <LogIn size={30} color={mau.chinh} />
      </View>
      <Text style={kieu.tieuDe} accessibilityRole="header">
        {t('taiKhoan.chuaDangNhap')}
      </Text>
      <Text style={kieu.moTa}>{moTa}</Text>
      {loi ? <Text style={kieu.loi}>{loi}</Text> : null}
      <NutBam nhan={t('taiKhoan.dangNhap')} onPress={dangNhap} dangChay={dangXuLy} style={kieu.nut} />
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
  tieuDe: { fontSize: chu.lon, fontWeight: '700', color: mau.chu, textAlign: 'center' },
  moTa: { fontSize: chu.than, color: mau.chuMo, textAlign: 'center', lineHeight: 26 },
  loi: { fontSize: chu.than, color: mau.loi, textAlign: 'center' },
  nut: { alignSelf: 'stretch', marginTop: khoang.s },
});
