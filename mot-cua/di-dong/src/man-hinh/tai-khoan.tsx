// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Màn tài khoản: giới thiệu app và máy chủ đang kết nối.
import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { cauHinh } from '../cau-hinh/moi-truong';
import { chu, khoang, mau } from '../giao-dien';
import { KhungMan } from '../thanh-phan/khung-man';
import { The } from '../thanh-phan/the';
import { version } from '../../package.json';

export function ManTaiKhoan() {
  const { t } = useTranslation();
  return (
    <KhungMan>
    <ScrollView contentContainerStyle={kieu.noiDung}>
      <View style={kieu.dauTrang}>
        <Image source={require('../tai-nguyen/logo.png')} style={kieu.logo} accessibilityIgnoresInvertColors />
        <Text style={kieu.ten} accessibilityRole="header">
          {t('ungDung.ten')}
        </Text>
        <Text style={kieu.moTa}>{t('ungDung.moTa')}</Text>
      </View>
      <The>
        <Text style={kieu.nhan}>{t('taiKhoan.mayChu')}</Text>
        <Text style={kieu.giaTri} selectable>
          {cauHinh.gatewayUrl}
        </Text>
        <Text style={[kieu.nhan, kieu.cach]}>{t('taiKhoan.phienBan')}</Text>
        <Text style={kieu.giaTri}>{version}</Text>
      </The>
    </ScrollView>
    </KhungMan>
  );
}

const kieu = StyleSheet.create({
  noiDung: { padding: khoang.l, gap: khoang.l },
  dauTrang: { alignItems: 'center', gap: khoang.s, paddingVertical: khoang.l },
  logo: { width: 88, height: 88 },
  ten: { fontSize: chu.tieuDeLon, fontWeight: '800', color: mau.chu },
  moTa: { fontSize: chu.than, color: mau.chuMo, textAlign: 'center' },
  nhan: { fontSize: chu.nho, color: mau.chuMo },
  giaTri: { fontSize: chu.than, color: mau.chu, fontWeight: '600' },
  cach: { marginTop: khoang.m },
});
