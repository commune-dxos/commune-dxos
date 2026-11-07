// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { chu, khoang, mau } from '../giao-dien';
import { useMang } from '../kho/mang';

/** Dải nhỏ ở đầu màn khi máy mất mạng; dữ liệu đã tải vẫn xem được. */
export function DaiMatMang() {
  const { t } = useTranslation();
  const coMang = useMang(s => s.coMang);
  if (coMang !== false) return null;
  return (
    <View style={kieu.dai} accessibilityRole="alert" testID="dai-mat-mang">
      <WifiOff size={18} color={mau.chuTrenPhu} />
      <Text style={kieu.chu}>{t('chung.matMang')}</Text>
    </View>
  );
}

const kieu = StyleSheet.create({
  dai: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: khoang.s,
    backgroundColor: mau.phu,
    paddingHorizontal: khoang.l,
    paddingVertical: khoang.s,
  },
  chu: { flex: 1, fontSize: chu.nho, color: mau.chuTrenPhu },
});
