// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Chi tiết một hồ sơ của tôi, cùng nội dung với trang chi tiết của cổng công dân: trạng thái, hạn, lời nhắn theo
// trạng thái, bước quy trình đang mở, bổ sung hồ sơ (khi chờ bổ sung), các mốc xử lý kèm lý do, giấy tờ đã nộp,
// biên nhận và thông báo kết quả có ký số. Kéo xuống để làm mới.
import React, { useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { CircleCheck, FileImage, ShieldCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { khoaTruyVan } from '../cau-hinh/truy-van';
import { bo, chu, dong, khoang, mau } from '../giao-dien';
import { ngay } from '../dich-vu/dinh-dang';
import { coGiayTo } from '../dich-vu/giay-to';
import { cauLoi } from '../dich-vu/goi-api';
import { buocDangMo, quaHan, useChiTietHoSo } from '../dich-vu/ho-so';
import type { CacManGoc } from '../dieu-huong/kieu';
import { usePhien } from '../kho/phien-dang-nhap';
import { KhoiBoSung } from '../thanh-phan/khoi-bo-sung';
import { KhungMan } from '../thanh-phan/khung-man';
import { ManTrangThai } from '../thanh-phan/man-trang-thai';
import { MocTrangThai } from '../thanh-phan/moc-trang-thai';
import { NhanTrangThai } from '../thanh-phan/nhan-trang-thai';
import { NutGiayTo } from '../thanh-phan/nut-giay-to';
import { The } from '../thanh-phan/the';
import { YeuCauDangNhap } from '../thanh-phan/yeu-cau-dang-nhap';

type Props = NativeStackScreenProps<CacManGoc, 'ChiTietHoSo'>;

export const kichThuoc = (b: number) =>
  b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

/** Lời nhắn đầu màn theo trạng thái, như cổng công dân. */
function khoaLoiNhan(trangThai: string) {
  if (trangThai === 'cho_bo_sung') return 'hoSo.loiNhanBoSung';
  if (trangThai === 'hoan_tat') return 'hoSo.loiNhanHoanTat';
  if (trangThai === 'tu_choi') return 'hoSo.loiNhanTuChoi';
  return null;
}

export function ManChiTietHoSo({ route }: Props) {
  const { t } = useTranslation();
  const boTruyVan = useQueryClient();
  const coPhien = usePhien(s => !!s.phien);
  const truyVan = useChiTietHoSo(route.params.id);
  const [daNopLai, setDaNopLai] = useState(false);
  const cuon = useRef<ScrollView>(null);
  /** Đang chờ cuộn lên đầu sau khi nộp lại: giữ tới khi khối bổ sung đã biến mất khỏi màn. */
  const choCuonLen = useRef(false);

  if (!coPhien) {
    return (
      <KhungMan>
        <YeuCauDangNhap moTa={t('hoSo.canDangNhap')} />
      </KhungMan>
    );
  }
  if (truyVan.isPending) return <ManTrangThai loai="dang-tai" tieuDe={t('hoSo.dangTaiMot')} />;
  if (truyVan.isError || !truyVan.data.hoSo) {
    return (
      <KhungMan>
        <ManTrangThai
          loai={truyVan.isError ? 'loi' : 'trong'}
          tieuDe={truyVan.isError ? t('chung.loiTieuDe') : t('hoSo.khongThay')}
          moTa={truyVan.isError ? cauLoi(truyVan.error) : t('hoSo.khongThayMoTa')}
          onThuLai={() => truyVan.refetch()}
        />
      </KhungMan>
    );
  }
  const { hoSo, lichSu, tep, tienDo } = truyVan.data;
  const loiNhan = khoaLoiNhan(hoSo.trang_thai);
  const dangMo = buocDangMo(tienDo);
  const tre = quaHan(hoSo);

  function sauNopLai() {
    setDaNopLai(true);
    // Thông báo "Đã nộp lại" nằm đầu trang, nút Nộp lại ở dưới: cuộn lên để người dân thấy. Hồ sơ tải lại thì
    // khối bổ sung biến mất, nội dung ngắn lại sau lần cuộn này; onContentSizeChange cuộn lại lần nữa.
    choCuonLen.current = true;
    cuon.current?.scrollTo({ y: 0, animated: true });
    boTruyVan.invalidateQueries({ queryKey: khoaTruyVan.hoSoCuaToi });
  }

  return (
    <KhungMan>
      <ScrollView
        ref={cuon}
        onContentSizeChange={() => {
          if (!choCuonLen.current) return;
          cuon.current?.scrollTo({ y: 0, animated: false });
          if (hoSo.trang_thai !== 'cho_bo_sung') choCuonLen.current = false;
        }}
        onScrollBeginDrag={() => {
          // Người dân tự kéo màn: thôi tự cuộn (vd tải lại hỏng, khối bổ sung còn đó).
          choCuonLen.current = false;
        }}
        contentContainerStyle={kieu.noiDung}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
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
          {loiNhan ? <Text style={kieu.loiNhan}>{t(loiNhan)}</Text> : null}
        </View>

        {daNopLai ? (
          <View style={kieu.daNopLai} accessibilityLiveRegion="polite" testID="da-nop-lai">
            <CircleCheck size={24} color={mau.chuTrenChinhNhat} />
            <Text style={kieu.chuDaNopLai}>{t('boSung.daNopLai')}</Text>
          </View>
        ) : null}

        <The style={kieu.hang}>
          <View style={kieu.o}>
            <Text style={kieu.nhan}>{t('hoSo.ngayNhan')}</Text>
            <Text style={kieu.giaTri}>{ngay(hoSo.ngay_nhan)}</Text>
          </View>
          <View style={kieu.o}>
            <Text style={kieu.nhan}>{hoSo.ngay_hoan_tat ? t('hoSo.ngayHoanTat') : t('hoSo.hanXuLy')}</Text>
            <Text style={[kieu.giaTri, tre && kieu.tre]}>{ngay(hoSo.ngay_hoan_tat ?? hoSo.han_xu_ly) || '—'}</Text>
            {tre ? <Text style={kieu.chuTre}>{t('hoSo.quaHan')}</Text> : null}
          </View>
        </The>

        {dangMo.length ? (
          <The style={kieu.buoc} testID="buoc-dang-mo">
            <Text style={kieu.nhan}>{t('hoSo.buocDangMo')}</Text>
            <Text style={kieu.chuBuoc}>{dangMo.join(', ')}</Text>
          </The>
        ) : null}

        {hoSo.trang_thai === 'tu_choi' ? (
          <The style={kieu.thongBao}>
            <Text style={kieu.tieuDeThongBao}>{t('hoSo.lyDoTuChoi')}</Text>
            <Text style={kieu.chuThongBao}>{hoSo.ly_do || t('hoSo.lienHeMotCua')}</Text>
          </The>
        ) : null}

        {hoSo.trang_thai === 'cho_bo_sung' ? (
          <KhoiBoSung hoSo={hoSo} tep={tep} xong={sauNopLai} />
        ) : null}

        <Text style={kieu.tieuDeMuc} accessibilityRole="header">
          {t('giayTo.tieuDe')}
        </Text>
        <The style={kieu.dsGiayTo}>
          <Text style={kieu.moTa}>{t('giayTo.moTa')}</Text>
          {coGiayTo(hoSo.trang_thai, 'ket_qua') ? <NutGiayTo hoSoId={hoSo.id} loai="ket_qua" /> : null}
          <NutGiayTo hoSoId={hoSo.id} loai="bien_nhan" />
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
                  <ShieldCheck size={22} color={mau.chinh} accessibilityLabel={t('hoSo.daQuet')} />
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
  ten: { fontSize: chu.tieuDe, lineHeight: dong.tieuDe, fontWeight: '800', color: mau.chu },
  ma: { fontSize: chu.lon, fontWeight: '700', color: mau.chuMo, letterSpacing: 0.3 },
  loiNhan: { fontSize: chu.than, lineHeight: dong.than, color: mau.chu, marginTop: khoang.xs },
  daNopLai: {
    flexDirection: 'row',
    gap: khoang.m,
    alignItems: 'center',
    backgroundColor: mau.chinhNhat,
    borderColor: mau.chinh,
    borderWidth: 2,
    borderRadius: bo.the,
    padding: khoang.l,
  },
  chuDaNopLai: { flex: 1, fontSize: chu.than, lineHeight: dong.than, fontWeight: '700', color: mau.chuTrenChinhNhat },
  thongBao: { backgroundColor: mau.loiNhat, borderColor: mau.canhBao, gap: khoang.xs },
  tieuDeThongBao: { fontSize: chu.than, fontWeight: '700', color: mau.loi },
  chuThongBao: { fontSize: chu.than, color: mau.chu, lineHeight: dong.than },
  hang: { flexDirection: 'row', gap: khoang.l },
  o: { flex: 1, gap: 2 },
  nhan: { fontSize: chu.nho, color: mau.chuMo },
  giaTri: { fontSize: chu.lon, fontWeight: '700', color: mau.chu },
  tre: { color: mau.loi },
  chuTre: { fontSize: chu.nho, color: mau.loi, fontWeight: '700' },
  buoc: { gap: khoang.xs, borderLeftWidth: 4, borderLeftColor: mau.lienKet },
  chuBuoc: { fontSize: chu.than, lineHeight: dong.than, fontWeight: '700', color: mau.chuTrenPhu },
  tieuDeMuc: { fontSize: chu.lon, fontWeight: '700', color: mau.chu, marginTop: khoang.s },
  moTa: { fontSize: chu.nho, lineHeight: dong.nho, color: mau.chuMo },
  dsGiayTo: { gap: khoang.l },
  dsTep: { gap: khoang.m },
  tep: { flexDirection: 'row', alignItems: 'center', gap: khoang.m },
  tenTep: { fontSize: chu.than, color: mau.chu },
});
