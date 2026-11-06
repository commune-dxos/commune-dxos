// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Chi tiết thủ tục: thời hạn, lệ phí, thành phần hồ sơ đọc từ JSON Schema của gói thủ tục.
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CircleCheck, Circle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { chu, khoang, mau } from '../giao-dien';
import { nopTrucTuyen, useDanhMucThuTuc } from '../dich-vu/danh-muc';
import { lePhi, thoiHan } from '../dich-vu/dinh-dang';
import { cauLoi } from '../dich-vu/goi-api';
import { docThanhPhan } from '../dich-vu/thanh-phan';
import type { CacManGoc } from '../dieu-huong/kieu';
import { KhungMan } from '../thanh-phan/khung-man';
import { ManTrangThai } from '../thanh-phan/man-trang-thai';
import { The } from '../thanh-phan/the';

type Props = NativeStackScreenProps<CacManGoc, 'ChiTietThuTuc'>;

export function ManChiTietThuTuc({ route }: Props) {
  const { t } = useTranslation();
  const truyVan = useDanhMucThuTuc();
  const thuTuc = truyVan.data?.find(x => x.ma === route.params.ma);

  if (truyVan.isPending) return <ManTrangThai loai="dang-tai" />;
  if (!thuTuc) {
    return (
      <ManTrangThai
        loai={truyVan.isError ? 'loi' : 'trong'}
        tieuDe={truyVan.isError ? t('chung.loiTieuDe') : t('thuTuc.khongThay')}
        moTa={truyVan.isError ? cauLoi(truyVan.error) : undefined}
        onThuLai={truyVan.isError ? () => truyVan.refetch() : undefined}
      />
    );
  }
  const thanhPhan = docThanhPhan(thuTuc.json_schema);

  return (
    <KhungMan>
      <ScrollView contentContainerStyle={kieu.noiDung}>
        <View style={kieu.dau}>
          {thuTuc.linh_vuc ? <Text style={kieu.linhVuc}>{thuTuc.linh_vuc.ten}</Text> : null}
          <Text style={kieu.ten} accessibilityRole="header">
            {thuTuc.ten}
          </Text>
          <Text style={kieu.ma}>
            {t('thuTuc.ma')}: {thuTuc.ma}
          </Text>
        </View>

        <The style={kieu.hang}>
          <View style={kieu.o}>
            <Text style={kieu.nhan}>{t('thuTuc.thoiHan')}</Text>
            <Text style={kieu.giaTri}>{thoiHan(thuTuc.so_ngay_xu_ly)}</Text>
          </View>
          <View style={kieu.o}>
            <Text style={kieu.nhan}>{t('thuTuc.lePhi')}</Text>
            <Text style={kieu.giaTri}>{lePhi(thuTuc.le_phi)}</Text>
            {thuTuc.ghi_chu_le_phi ? <Text style={kieu.ghiChu}>{thuTuc.ghi_chu_le_phi}</Text> : null}
          </View>
        </The>

        <Text style={kieu.tieuDeMuc} accessibilityRole="header">
          {t('thuTuc.thanhPhan')}
        </Text>
        {thanhPhan.length === 0 ? (
          <Text style={kieu.ghiChu}>{t('thuTuc.chuaCoThanhPhan')}</Text>
        ) : (
          <The style={kieu.dsThanhPhan}>
            {thanhPhan.map(tp => (
              <View key={tp.ma} style={kieu.thanhPhan}>
                {tp.batBuoc ? (
                  <CircleCheck size={22} color={mau.chinh} />
                ) : (
                  <Circle size={22} color={mau.chuMo} />
                )}
                <View style={kieu.cot}>
                  <Text style={kieu.tenThanhPhan}>{tp.ten}</Text>
                  <Text style={kieu.ghiChu}>
                    {tp.batBuoc ? t('thuTuc.batBuoc') : t('thuTuc.neuCo')}
                    {tp.moTa ? ` · ${tp.moTa}` : ''}
                  </Text>
                </View>
              </View>
            ))}
          </The>
        )}

        {!nopTrucTuyen(thuTuc) ? (
          <The style={kieu.thongBao}>
            <Text style={kieu.chuThongBao}>{t('thuTuc.chuaNhanTrucTuyen')}</Text>
          </The>
        ) : null}
      </ScrollView>
    </KhungMan>
  );
}

const kieu = StyleSheet.create({
  noiDung: { padding: khoang.l, gap: khoang.l, paddingBottom: khoang.xxl },
  dau: { gap: khoang.xs },
  linhVuc: { fontSize: chu.nho, color: mau.chuTrenChinhNhat, fontWeight: '600' },
  ten: { fontSize: chu.tieuDe, fontWeight: '800', color: mau.chu },
  ma: { fontSize: chu.nho, color: mau.chuMo },
  hang: { flexDirection: 'row', gap: khoang.l },
  o: { flex: 1, gap: 2 },
  nhan: { fontSize: chu.nho, color: mau.chuMo },
  giaTri: { fontSize: chu.lon, fontWeight: '700', color: mau.chu },
  tieuDeMuc: { fontSize: chu.lon, fontWeight: '700', color: mau.chu },
  dsThanhPhan: { gap: khoang.l },
  thanhPhan: { flexDirection: 'row', gap: khoang.m },
  cot: { flex: 1, gap: 2 },
  tenThanhPhan: { fontSize: chu.than, fontWeight: '600', color: mau.chu },
  ghiChu: { fontSize: chu.nho, color: mau.chuMo, lineHeight: 22 },
  thongBao: { backgroundColor: mau.phu, borderColor: mau.phu },
  chuThongBao: { fontSize: chu.than, color: mau.chuTrenPhu },
});
