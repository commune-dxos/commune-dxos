// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Nộp xong: mã hồ sơ để tra cứu, hạn xử lý dự kiến, đường đi tiếp.
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CircleCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { chu, khoang, mau } from '../giao-dien';
import { ngay } from '../dich-vu/dinh-dang';
import type { CacManGoc } from '../dieu-huong/kieu';
import { NutBam } from '../thanh-phan/nut-bam';
import { The } from '../thanh-phan/the';

type Props = NativeStackScreenProps<CacManGoc, 'DaNop'>;

export function ManDaNop({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { maHoSo, hanXuLy, tenThuTuc } = route.params;
  return (
    <ScrollView contentContainerStyle={kieu.noiDung}>
      <View style={kieu.dau}>
        <CircleCheck size={56} color={mau.chinh} />
        <Text style={kieu.tieuDe} accessibilityRole="header">
          {t('daNop.tieuDe')}
        </Text>
        <Text style={kieu.moTa}>{tenThuTuc}</Text>
      </View>
      <The style={kieu.the} testID="da-nop">
        <Text style={kieu.nhan}>{t('traCuu.maHoSo')}</Text>
        <Text style={kieu.ma} selectable>
          {maHoSo}
        </Text>
        <Text style={kieu.nhan}>{t('hoSo.hanXuLy')}</Text>
        <Text style={kieu.giaTri}>{ngay(hanXuLy)}</Text>
      </The>
      <Text style={kieu.moTa}>{t('daNop.ghiChu')}</Text>
      <NutBam
        nhan={t('daNop.xemHoSo')}
        onPress={() => navigation.navigate('Tab', { screen: 'HoSoCuaToi' })}
        testID="nut-xem-ho-so"
      />
      <NutBam nhan={t('daNop.veThuTuc')} kieu="vien" onPress={() => navigation.navigate('Tab', { screen: 'ThuTuc' })} />
    </ScrollView>
  );
}

const kieu = StyleSheet.create({
  noiDung: { padding: khoang.l, gap: khoang.l, paddingTop: khoang.xxl },
  dau: { alignItems: 'center', gap: khoang.s },
  tieuDe: { fontSize: chu.tieuDe, fontWeight: '800', color: mau.chu, textAlign: 'center' },
  moTa: { fontSize: chu.than, color: mau.chuMo, textAlign: 'center', lineHeight: 25 },
  the: { gap: khoang.xs, alignItems: 'center' },
  nhan: { fontSize: chu.nho, color: mau.chuMo },
  ma: { fontSize: chu.tieuDeLon, fontWeight: '800', color: mau.chinh, letterSpacing: 0.5, marginBottom: khoang.s },
  giaTri: { fontSize: chu.lon, fontWeight: '700', color: mau.chu },
});
