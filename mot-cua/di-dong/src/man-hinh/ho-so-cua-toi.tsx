// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Hồ sơ của tôi: các hồ sơ công dân đã nộp, mới nhất ở trên, kèm trạng thái và hạn xử lý.
import React from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { chu, dong, khoang, mau } from '../giao-dien';
import { ngay } from '../dich-vu/dinh-dang';
import { cauLoi } from '../dich-vu/goi-api';
import { quaHan, useHoSoCuaToi, type HoSoCuaToi } from '../dich-vu/ho-so';
import { usePhien } from '../kho/phien-dang-nhap';
import { KhungMan } from '../thanh-phan/khung-man';
import { ManTrangThai } from '../thanh-phan/man-trang-thai';
import { NhanTrangThai } from '../thanh-phan/nhan-trang-thai';
import { The } from '../thanh-phan/the';
import { YeuCauDangNhap } from '../thanh-phan/yeu-cau-dang-nhap';

function DongHoSo({ hoSo, onPress }: { hoSo: HoSoCuaToi; onPress: () => void }) {
  const { t } = useTranslation();
  const tre = quaHan(hoSo);
  return (
    <The onPress={onPress} nhanTroNang={`${hoSo.thu_tuc?.ten ?? ''} ${hoSo.ma_ho_so}`} testID={`ho-so-${hoSo.ma_ho_so}`}>
      <View style={kieu.dongTren}>
        <View style={kieu.cot}>
          <Text style={kieu.ten}>{hoSo.thu_tuc?.ten ?? t('hoSo.thuTucKhac')}</Text>
          <Text style={kieu.ma}>{hoSo.ma_ho_so}</Text>
        </View>
        <ChevronRight color={mau.chuMo} size={22} />
      </View>
      <NhanTrangThai ma={hoSo.trang_thai} />
      <Text style={kieu.ngay}>
        {t('hoSo.ngayNhan')} {ngay(hoSo.ngay_nhan)}
        {hoSo.ngay_hoan_tat
          ? ` · ${t('hoSo.ngayHoanTat')} ${ngay(hoSo.ngay_hoan_tat)}`
          : hoSo.han_xu_ly
          ? ` · ${t('hoSo.hanXuLy')} ${ngay(hoSo.han_xu_ly)}`
          : ''}
      </Text>
      {tre ? <Text style={kieu.tre}>{t('hoSo.quaHan')}</Text> : null}
      {hoSo.trang_thai === 'cho_bo_sung' && hoSo.ly_do ? (
        <Text style={kieu.lyDo}>
          {t('hoSo.canBoSung')}: {hoSo.ly_do}
        </Text>
      ) : null}
    </The>
  );
}

export function ManHoSoCuaToi() {
  const { t } = useTranslation();
  const dieuHuong = useNavigation();
  const coPhien = usePhien(s => !!s.phien);
  const dangKhoiPhuc = usePhien(s => s.dangKhoiPhuc);
  const truyVan = useHoSoCuaToi();

  let noiDung: React.ReactNode;
  if (dangKhoiPhuc) {
    noiDung = <ManTrangThai loai="dang-tai" />;
  } else if (!coPhien) {
    noiDung = <YeuCauDangNhap moTa={t('hoSo.canDangNhap')} />;
  } else if (truyVan.isPending) {
    noiDung = <ManTrangThai loai="dang-tai" tieuDe={t('hoSo.dangTai')} />;
  } else if (truyVan.isError && !truyVan.data) {
    noiDung = (
      <ManTrangThai loai="loi" tieuDe={t('chung.loiTieuDe')} moTa={cauLoi(truyVan.error)} onThuLai={() => truyVan.refetch()} />
    );
  } else {
    noiDung = (
      <FlatList
        data={truyVan.data}
        keyExtractor={x => x.id}
        contentContainerStyle={kieu.danhSach}
        renderItem={({ item }) => (
          <DongHoSo hoSo={item} onPress={() => dieuHuong.navigate('ChiTietHoSo', { id: item.id })} />
        )}
        refreshControl={
          <RefreshControl refreshing={truyVan.isRefetching} onRefresh={() => truyVan.refetch()} colors={[mau.chinh]} />
        }
        ListEmptyComponent={<ManTrangThai loai="trong" tieuDe={t('hoSo.chuaCo')} moTa={t('hoSo.chuaCoMoTa')} />}
      />
    );
  }
  return <KhungMan>{noiDung}</KhungMan>;
}

const kieu = StyleSheet.create({
  danhSach: { padding: khoang.l, gap: khoang.m, flexGrow: 1 },
  dongTren: { flexDirection: 'row', alignItems: 'center', gap: khoang.s, marginBottom: khoang.s },
  cot: { flex: 1, gap: 2 },
  ten: { fontSize: chu.lon, lineHeight: dong.lon, fontWeight: '700', color: mau.chu },
  ma: { fontSize: chu.nho, fontWeight: '600', color: mau.chuMo, letterSpacing: 0.3 },
  ngay: { fontSize: chu.nho, color: mau.chuMo, marginTop: khoang.s },
  tre: { fontSize: chu.nho, color: mau.loi, fontWeight: '700', marginTop: khoang.xs },
  lyDo: { fontSize: chu.nho, lineHeight: dong.nho, color: mau.loi, fontWeight: '600', marginTop: khoang.xs },
});
