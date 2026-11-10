// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Màn tài khoản: đăng nhập, đăng xuất bằng tài khoản công dân trên Keycloak; giới thiệu app và máy chủ.
import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { cauHinh } from '../cau-hinh/moi-truong';
import { chu, dong, khoang, mau } from '../giao-dien';
import { usePhien } from '../kho/phien-dang-nhap';
import { KhungMan } from '../thanh-phan/khung-man';
import { NutBam } from '../thanh-phan/nut-bam';
import { The } from '../thanh-phan/the';
import { version } from '../../package.json';

export function ManTaiKhoan() {
  const { t } = useTranslation();
  const boTruyVan = useQueryClient();
  const { phien, nguoiDung, dangXuLy, loi, dangNhap, dangXuat } = usePhien();

  async function bamDangXuat() {
    await dangXuat();
    // Bỏ dữ liệu riêng của người vừa đăng xuất khỏi bộ nhớ tạm.
    boTruyVan.removeQueries({ queryKey: ['ho-so-cua-toi'] });
  }

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
          {phien ? (
            <View style={kieu.khoi} testID="da-dang-nhap">
              <Text style={kieu.nhan}>{t('taiKhoan.dangNhapVoi')}</Text>
              <Text style={kieu.tenNguoi}>{nguoiDung?.ten ?? t('taiKhoan.congDan')}</Text>
              {nguoiDung?.tenDangNhap ? <Text style={kieu.moTa}>{nguoiDung.tenDangNhap}</Text> : null}
              <NutBam
                nhan={t('taiKhoan.dangXuat')}
                kieu="vien"
                onPress={bamDangXuat}
                dangChay={dangXuLy}
                testID="nut-dang-xuat"
              />
            </View>
          ) : (
            <View style={kieu.khoi} testID="chua-dang-nhap">
              <Text style={kieu.tieuDeKhoi}>{t('taiKhoan.chuaDangNhap')}</Text>
              <Text style={kieu.moTa}>{t('taiKhoan.loiIchDangNhap')}</Text>
              {loi ? (
                <Text style={kieu.loi} accessibilityLiveRegion="polite">
                  {loi}
                </Text>
              ) : null}
              <NutBam nhan={t('taiKhoan.dangNhap')} onPress={dangNhap} dangChay={dangXuLy} testID="nut-dang-nhap" />
            </View>
          )}
        </The>

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
  moTa: { fontSize: chu.than, color: mau.chuMo, lineHeight: dong.than },
  khoi: { gap: khoang.s },
  tieuDeKhoi: { fontSize: chu.lon, fontWeight: '700', color: mau.chu },
  tenNguoi: { fontSize: chu.tieuDe, fontWeight: '700', color: mau.chu },
  loi: { fontSize: chu.than, color: mau.loi },
  nhan: { fontSize: chu.nho, color: mau.chuMo },
  giaTri: { fontSize: chu.than, color: mau.chu, fontWeight: '600' },
  cach: { marginTop: khoang.m },
});
