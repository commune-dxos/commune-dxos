// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Danh sách thủ tục cấp xã: ô tìm không dấu, thời hạn, lệ phí, lĩnh vực; kéo xuống để tải lại.
import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ChevronRight, Clock, Search, Wallet } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { bo, chu, khoang, mau } from '../giao-dien';
import { locThuTuc, nopTrucTuyen, useDanhMucThuTuc, type ThuTuc } from '../dich-vu/danh-muc';
import { lePhi, thoiHan } from '../dich-vu/dinh-dang';
import { cauLoi } from '../dich-vu/goi-api';
import { KhungMan } from '../thanh-phan/khung-man';
import { ManTrangThai } from '../thanh-phan/man-trang-thai';
import { The } from '../thanh-phan/the';

function DongThuTuc({ thuTuc, onPress }: { thuTuc: ThuTuc; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <The onPress={onPress} nhanTroNang={thuTuc.ten} testID={`thu-tuc-${thuTuc.ma}`}>
      <View style={kieu.dongTren}>
        <View style={kieu.cotChu}>
          {thuTuc.linh_vuc ? <Text style={kieu.linhVuc}>{thuTuc.linh_vuc.ten}</Text> : null}
          <Text style={kieu.tenThuTuc}>{thuTuc.ten}</Text>
        </View>
        <ChevronRight color={mau.chuMo} size={22} />
      </View>
      <View style={kieu.thongTin}>
        <View style={kieu.muc}>
          <Clock size={16} color={mau.chuMo} />
          <Text style={kieu.chuPhu}>{thoiHan(thuTuc.so_ngay_xu_ly)}</Text>
        </View>
        <View style={kieu.muc}>
          <Wallet size={16} color={mau.chuMo} />
          <Text style={kieu.chuPhu}>{lePhi(thuTuc.le_phi)}</Text>
        </View>
      </View>
      {nopTrucTuyen(thuTuc) ? (
        <Text style={kieu.nhanTrucTuyen}>{t('thuTuc.nopTrucTuyen')}</Text>
      ) : (
        <Text style={kieu.nhanTaiQuay}>{t('thuTuc.nopTaiQuay')}</Text>
      )}
    </The>
  );
}

export function ManDanhSachThuTuc() {
  const { t } = useTranslation();
  const dieuHuong = useNavigation();
  const truyVan = useDanhMucThuTuc();
  const [tuKhoa, setTuKhoa] = useState('');
  const ds = useMemo(() => locThuTuc(truyVan.data ?? [], tuKhoa), [truyVan.data, tuKhoa]);

  let noiDung: React.ReactNode;
  if (truyVan.isPending) {
    noiDung = <ManTrangThai loai="dang-tai" tieuDe={t('thuTuc.dangTai')} />;
  } else if (truyVan.isError && !truyVan.data) {
    noiDung = (
      <ManTrangThai
        loai="loi"
        tieuDe={t('chung.loiTieuDe')}
        moTa={cauLoi(truyVan.error)}
        onThuLai={() => truyVan.refetch()}
      />
    );
  } else {
    noiDung = (
      <FlatList
        data={ds}
        keyExtractor={x => x.id}
        contentContainerStyle={kieu.danhSach}
        renderItem={({ item }) => (
          <DongThuTuc thuTuc={item} onPress={() => dieuHuong.navigate('ChiTietThuTuc', { ma: item.ma })} />
        )}
        refreshControl={
          <RefreshControl
            refreshing={truyVan.isRefetching}
            onRefresh={() => truyVan.refetch()}
            colors={[mau.chinh]}
          />
        }
        ListEmptyComponent={
          <ManTrangThai
            loai="trong"
            tieuDe={tuKhoa ? t('thuTuc.khongKhop') : t('thuTuc.chuaCo')}
            moTa={tuKhoa ? t('thuTuc.khongKhopMoTa') : undefined}
          />
        }
      />
    );
  }

  return (
    <KhungMan>
      <View style={kieu.oTim}>
        <Search size={20} color={mau.chuMo} />
        <TextInput
          value={tuKhoa}
          onChangeText={setTuKhoa}
          placeholder={t('thuTuc.timGoiY')}
          placeholderTextColor={mau.chuMo}
          accessibilityLabel={t('thuTuc.tim')}
          style={kieu.oNhapTim}
          returnKeyType="search"
          testID="o-tim-thu-tuc"
        />
      </View>
      {noiDung}
    </KhungMan>
  );
}

const kieu = StyleSheet.create({
  oTim: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: khoang.s,
    margin: khoang.l,
    marginBottom: 0,
    paddingHorizontal: khoang.m,
    borderWidth: 1.5,
    borderColor: mau.vienONhap,
    borderRadius: bo.vua,
    backgroundColor: mau.nen,
  },
  oNhapTim: { flex: 1, minHeight: 50, fontSize: chu.than, color: mau.chu },
  danhSach: { padding: khoang.l, gap: khoang.m, flexGrow: 1 },
  dongTren: { flexDirection: 'row', alignItems: 'center', gap: khoang.s },
  cotChu: { flex: 1, gap: 2 },
  linhVuc: { fontSize: chu.nho, color: mau.chuTrenChinhNhat, fontWeight: '600' },
  tenThuTuc: { fontSize: chu.lon, fontWeight: '700', color: mau.chu },
  thongTin: { flexDirection: 'row', flexWrap: 'wrap', gap: khoang.l, marginTop: khoang.s },
  muc: { flexDirection: 'row', alignItems: 'center', gap: khoang.xs },
  chuPhu: { fontSize: chu.nho, color: mau.chuMo },
  nhanTrucTuyen: { marginTop: khoang.s, fontSize: chu.nho, color: mau.chinh, fontWeight: '600' },
  nhanTaiQuay: { marginTop: khoang.s, fontSize: chu.nho, color: mau.chuMo },
});
