// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Chi tiết một hồ sơ của tôi: trạng thái, hạn, lý do cần bổ sung, các mốc xử lý, giấy tờ đã nộp.
import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FileImage, ShieldCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { chu, khoang, mau } from '../giao-dien';
import { ngay } from '../dich-vu/dinh-dang';
import { cauLoi } from '../dich-vu/goi-api';
import { quaHan, useChiTietHoSo } from '../dich-vu/ho-so';
import type { CacManGoc } from '../dieu-huong/kieu';
import { KhungMan } from '../thanh-phan/khung-man';
import { ManTrangThai } from '../thanh-phan/man-trang-thai';
import { MocTrangThai } from '../thanh-phan/moc-trang-thai';
import { NhanTrangThai } from '../thanh-phan/nhan-trang-thai';
import { The } from '../thanh-phan/the';

type Props = NativeStackScreenProps<CacManGoc, 'ChiTietHoSo'>;

const kichThuoc = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export function ManChiTietHoSo({ route }: Props) {
  const { t } = useTranslation();
  const truyVan = useChiTietHoSo(route.params.id);

  if (truyVan.isPending) return <ManTrangThai loai="dang-tai" />;
  if (truyVan.isError || !truyVan.data.hoSo) {
    return (
      <ManTrangThai
        loai={truyVan.isError ? 'loi' : 'trong'}
        tieuDe={truyVan.isError ? t('chung.loiTieuDe') : t('hoSo.khongThay')}
        moTa={truyVan.isError ? cauLoi(truyVan.error) : undefined}
        onThuLai={() => truyVan.refetch()}
      />
    );
  }
  const { hoSo, lichSu, tep } = truyVan.data;

  return (
    <KhungMan>
      <ScrollView
        contentContainerStyle={kieu.noiDung}
        refreshControl={
          <RefreshControl refreshing={truyVan.isRefetching} onRefresh={() => truyVan.refetch()} colors={[mau.chinh]} />
        }>
        <View style={kieu.dau}>
          <Text style={kieu.ten} accessibilityRole="header">
            {hoSo.thu_tuc?.ten ?? t('hoSo.thuTucKhac')}
          </Text>
          <Text style={kieu.ma} selectable>
            {hoSo.ma_ho_so}
          </Text>
          <NhanTrangThai ma={hoSo.trang_thai} />
        </View>

        {hoSo.trang_thai === 'cho_bo_sung' || hoSo.trang_thai === 'tu_choi' ? (
          <The style={kieu.thongBao}>
            <Text style={kieu.tieuDeThongBao}>
              {hoSo.trang_thai === 'cho_bo_sung' ? t('hoSo.canBoSung') : t('hoSo.lyDoTuChoi')}
            </Text>
            <Text style={kieu.chuThongBao}>{hoSo.ly_do || t('hoSo.lienHeMotCua')}</Text>
            {hoSo.trang_thai === 'cho_bo_sung' ? <Text style={kieu.chuThongBao}>{t('hoSo.boSungTrenWeb')}</Text> : null}
          </The>
        ) : null}

        <The style={kieu.hang}>
          <View style={kieu.o}>
            <Text style={kieu.nhan}>{t('hoSo.ngayNhan')}</Text>
            <Text style={kieu.giaTri}>{ngay(hoSo.ngay_nhan)}</Text>
          </View>
          <View style={kieu.o}>
            <Text style={kieu.nhan}>{hoSo.ngay_hoan_tat ? t('hoSo.ngayHoanTat') : t('hoSo.hanXuLy')}</Text>
            <Text style={[kieu.giaTri, quaHan(hoSo) && kieu.tre]}>{ngay(hoSo.ngay_hoan_tat ?? hoSo.han_xu_ly) || '—'}</Text>
            {quaHan(hoSo) ? <Text style={kieu.chuTre}>{t('hoSo.quaHan')}</Text> : null}
          </View>
        </The>

        <Text style={kieu.tieuDeMuc} accessibilityRole="header">
          {t('hoSo.cacMoc')}
        </Text>
        <The>
          {lichSu.length ? (
            <MocTrangThai cacMoc={lichSu.map(m => ({ trangThai: m.den_trang_thai, luc: m.luc, lyDo: m.ly_do }))} />
          ) : (
            <Text style={kieu.nhan}>{t('hoSo.chuaCoMoc')}</Text>
          )}
        </The>

        <Text style={kieu.tieuDeMuc} accessibilityRole="header">
          {t('hoSo.giayToDaNop')}
        </Text>
        <The style={kieu.dsTep}>
          {tep === null ? (
            <Text style={kieu.nhan}>{t('hoSo.chuaTaiDuocGiayTo')}</Text>
          ) : tep.length === 0 ? (
            <Text style={kieu.nhan}>{t('hoSo.chuaCoGiayTo')}</Text>
          ) : (
            tep.map(f => (
              <View key={f.id} style={kieu.tep}>
                <FileImage size={22} color={mau.chuMo} />
                <View style={kieu.o}>
                  <Text style={kieu.tenTep} numberOfLines={1}>
                    {f.ten_tep}
                  </Text>
                  <Text style={kieu.nhan}>{kichThuoc(f.kich_thuoc)}</Text>
                </View>
                {f.ket_qua_quet === 'sach' ? (
                  <ShieldCheck size={20} color={mau.chinh} accessibilityLabel={t('hoSo.daQuet')} />
                ) : null}
              </View>
            ))
          )}
        </The>
      </ScrollView>
    </KhungMan>
  );
}

const kieu = StyleSheet.create({
  noiDung: { padding: khoang.l, gap: khoang.l, paddingBottom: khoang.xxl },
  dau: { gap: khoang.s },
  ten: { fontSize: chu.tieuDe, fontWeight: '800', color: mau.chu },
  ma: { fontSize: chu.than, color: mau.chuMo, letterSpacing: 0.3 },
  thongBao: { backgroundColor: mau.loiNhat, borderColor: mau.loi, gap: khoang.xs },
  tieuDeThongBao: { fontSize: chu.than, fontWeight: '700', color: mau.loi },
  chuThongBao: { fontSize: chu.than, color: mau.chu, lineHeight: 25 },
  hang: { flexDirection: 'row', gap: khoang.l },
  o: { flex: 1, gap: 2 },
  nhan: { fontSize: chu.nho, color: mau.chuMo },
  giaTri: { fontSize: chu.lon, fontWeight: '700', color: mau.chu },
  tre: { color: mau.canhBao },
  chuTre: { fontSize: chu.nho, color: mau.canhBao, fontWeight: '700' },
  tieuDeMuc: { fontSize: chu.lon, fontWeight: '700', color: mau.chu },
  dsTep: { gap: khoang.m },
  tep: { flexDirection: 'row', alignItems: 'center', gap: khoang.m },
  tenTep: { fontSize: chu.than, color: mau.chu },
});
