// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Nộp hồ sơ: người nộp → ảnh giấy tờ theo từng thành phần (chụp hoặc chọn) → kiểm đủ (Poka-yoke) → gửi.
// Lỗi giữa chừng thì giữ tiến độ, bấm "Thử lại" gửi tiếp từ chỗ dở dang.
import React, { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { khoaTruyVan } from '../cau-hinh/truy-van';
import { chu, dong, khoang, mau } from '../giao-dien';
import { nopTrucTuyen, useDanhMucThuTuc } from '../dich-vu/danh-muc';
import { cauLoi } from '../dich-vu/goi-api';
import {
  LoiThieuThanhPhan,
  kiemNguoiNop,
  nopHoSo,
  tienDoMoi,
  type AnhGiayTo,
  type BuocNop,
  type NguoiNop,
} from '../dich-vu/nop-ho-so';
import { docThanhPhan, kiemThanhPhan, type ThanhPhan } from '../dich-vu/thanh-phan';
import type { CacManGoc } from '../dieu-huong/kieu';
import { usePhien } from '../kho/phien-dang-nhap';
import { KhungMan } from '../thanh-phan/khung-man';
import { MucGiayTo, useChonAnh, type NguonAnh } from '../thanh-phan/muc-giay-to';
import { ManTrangThai } from '../thanh-phan/man-trang-thai';
import { NutBam } from '../thanh-phan/nut-bam';
import { ONhap } from '../thanh-phan/o-nhap';
import { The } from '../thanh-phan/the';
import { YeuCauDangNhap } from '../thanh-phan/yeu-cau-dang-nhap';

type Props = NativeStackScreenProps<CacManGoc, 'NopHoSo'>;

function cauBuoc(b: BuocNop | null, t: TFunction) {
  if (!b) return t('nop.dangGui');
  if (b.loai === 'tao') return t('nop.dangTao');
  if (b.loai === 'tai') return t('nop.dangTai', { thu: b.thu, tong: b.tong });
  return t('nop.dangKhoiTao');
}

export function ManNopHoSo({ route, navigation }: Props) {
  const { t } = useTranslation();
  const boTruyVan = useQueryClient();
  const danhMuc = useDanhMucThuTuc();
  const thuTuc = danhMuc.data?.find(x => x.ma === route.params.ma);
  const coPhien = usePhien(s => !!s.phien);
  const tenNguoiDung = usePhien(s => s.nguoiDung?.ten ?? '');

  const [nguoiNop, setNguoiNop] = useState<NguoiNop>({ hoTen: tenNguoiDung, soDienThoai: '' });
  const [loiNguoiNop, setLoiNguoiNop] = useState<{ hoTen?: string; soDienThoai?: string }>({});
  const [anh, setAnh] = useState<Record<string, AnhGiayTo[]>>({});
  const [loiGiayTo, setLoiGiayTo] = useState<Record<string, string>>({});
  const [buoc, setBuoc] = useState<BuocNop | null>(null);
  const tienDo = useRef(tienDoMoi());
  const chonAnh = useChonAnh();

  const nop = useMutation({
    mutationFn: () =>
      nopHoSo(thuTuc!, nguoiNop, anh, tienDo.current, {
        layToken: () => usePhien.getState().layToken(),
        baoBuoc: setBuoc,
      }),
    onSuccess: hoSo => {
      boTruyVan.invalidateQueries({ queryKey: khoaTruyVan.hoSoCuaToi });
      navigation.replace('DaNop', { id: hoSo.id, maHoSo: hoSo.ma_ho_so, hanXuLy: hoSo.han_xu_ly, tenThuTuc: thuTuc!.ten });
    },
    onError: e => {
      if (e instanceof LoiThieuThanhPhan) setLoiGiayTo(e.thanhPhan);
    },
  });

  if (danhMuc.isPending) return <ManTrangThai loai="dang-tai" />;
  if (!thuTuc) {
    return <ManTrangThai loai="trong" tieuDe={t('thuTuc.khongThay')} />;
  }
  if (!nopTrucTuyen(thuTuc)) {
    return <ManTrangThai loai="trong" tieuDe={thuTuc.ten} moTa={t('thuTuc.chuaNhanTrucTuyen')} />;
  }
  if (!coPhien) {
    return (
      <KhungMan>
        <YeuCauDangNhap moTa={t('nop.canDangNhap')} />
      </KhungMan>
    );
  }

  const dsThanhPhan = docThanhPhan(thuTuc.json_schema);
  const daGui = tienDo.current.hoSo !== null;

  async function themAnh(tp: ThanhPhan, nguon: NguonAnh) {
    const moi = await chonAnh(tp, nguon, anh[tp.ma]?.length ?? 0);
    if (!moi.length) return;
    setAnh(cu => {
      const ds = { ...cu, [tp.ma]: [...(cu[tp.ma] ?? []), ...moi] };
      if (Object.keys(loiGiayTo).length) setLoiGiayTo(kiemThanhPhan(thuTuc!.json_schema, demAnh(ds)));
      return ds;
    });
  }

  function boAnh(ma: string, uri: string) {
    setAnh(cu => ({ ...cu, [ma]: (cu[ma] ?? []).filter(a => a.uri !== uri) }));
  }

  function gui() {
    const loi1 = kiemNguoiNop(nguoiNop);
    const loi2 = kiemThanhPhan(thuTuc!.json_schema, demAnh(anh));
    setLoiNguoiNop(loi1);
    setLoiGiayTo(loi2);
    if (Object.keys(loi1).length || Object.keys(loi2).length) {
      Alert.alert(t('nop.chuaDuTieuDe'), t('nop.chuaDu'));
      return;
    }
    nop.mutate();
  }

  return (
    <KhungMan>
      <KeyboardAvoidingView style={kieu.lap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={kieu.noiDung}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
          <Text style={kieu.tenThuTuc} accessibilityRole="header">
            {thuTuc.ten}
          </Text>

          <Text style={kieu.tieuDeMuc}>{t('nop.nguoiNop')}</Text>
          <The style={kieu.form}>
            <ONhap
              nhan={t('nop.hoTen')}
              loi={loiNguoiNop.hoTen}
              value={nguoiNop.hoTen}
              onChangeText={hoTen => setNguoiNop(n => ({ ...n, hoTen }))}
              autoComplete="name"
              editable={!daGui}
              testID="o-ho-ten"
            />
            <ONhap
              nhan={t('nop.soDienThoai')}
              goiY={t('nop.goiYSoDienThoai')}
              loi={loiNguoiNop.soDienThoai}
              value={nguoiNop.soDienThoai}
              onChangeText={soDienThoai => setNguoiNop(n => ({ ...n, soDienThoai }))}
              keyboardType="phone-pad"
              autoComplete="tel"
              editable={!daGui}
              testID="o-so-dien-thoai"
            />
          </The>

          <Text style={kieu.tieuDeMuc}>{t('nop.giayTo')}</Text>
          <Text style={kieu.moTa}>{t('nop.goiYAnh')}</Text>
          <The style={kieu.form}>
            {dsThanhPhan.map(tp => (
              <MucGiayTo
                key={tp.ma}
                tp={tp}
                anh={anh[tp.ma] ?? []}
                loi={loiGiayTo[tp.ma]}
                onThem={nguon => themAnh(tp, nguon)}
                onBo={uri => boAnh(tp.ma, uri)}
              />
            ))}
          </The>

          {nop.isError && !(nop.error instanceof LoiThieuThanhPhan) ? (
            <The style={kieu.thongBaoLoi}>
              <Text style={kieu.tieuDeLoi}>{t('nop.chuaGuiXong')}</Text>
              <Text style={kieu.chuLoi}>{cauLoi(nop.error)}</Text>
              {daGui ? <Text style={kieu.chuLoi}>{t('nop.thuLaiTiep')}</Text> : null}
            </The>
          ) : null}

          {nop.isPending ? (
            <Text style={kieu.buoc} accessibilityLiveRegion="polite">
              {cauBuoc(buoc, t)}
            </Text>
          ) : null}
          <NutBam
            nhan={nop.isError ? t('chung.thuLai') : t('nop.nut')}
            onPress={gui}
            dangChay={nop.isPending}
            testID="nut-nop"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </KhungMan>
  );
}

function demAnh(anh: Record<string, AnhGiayTo[]>) {
  return Object.fromEntries(Object.entries(anh).map(([ma, ds]) => [ma, ds.length]));
}

const kieu = StyleSheet.create({
  lap: { flex: 1 },
  noiDung: { padding: khoang.l, gap: khoang.m, paddingBottom: khoang.xxl },
  tenThuTuc: { fontSize: chu.tieuDe, fontWeight: '800', color: mau.chu, marginBottom: khoang.s },
  tieuDeMuc: { fontSize: chu.lon, fontWeight: '700', color: mau.chu, marginTop: khoang.s },
  moTa: { fontSize: chu.nho, color: mau.chuMo, lineHeight: dong.nho },
  form: { gap: khoang.l },
  thongBaoLoi: { backgroundColor: mau.loiNhat, borderColor: mau.loi, gap: khoang.xs },
  tieuDeLoi: { fontSize: chu.than, fontWeight: '700', color: mau.loi },
  chuLoi: { fontSize: chu.than, color: mau.chu },
  buoc: { fontSize: chu.than, color: mau.chuMo, textAlign: 'center' },
});
