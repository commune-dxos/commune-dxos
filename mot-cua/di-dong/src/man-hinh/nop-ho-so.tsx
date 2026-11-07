// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Nộp hồ sơ: người nộp → ảnh giấy tờ theo từng thành phần (chụp hoặc chọn) → kiểm đủ (Poka-yoke) → gửi.
// Lỗi giữa chừng thì giữ tiến độ, bấm "Thử lại" gửi tiếp từ chỗ dở dang.
import React, { useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, ImagePlus, X } from 'lucide-react-native';
import { launchCamera, launchImageLibrary, type ImagePickerResponse } from 'react-native-image-picker';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { khoaTruyVan } from '../cau-hinh/truy-van';
import { bo, chu, khoang, mau } from '../giao-dien';
import { nopTrucTuyen, useDanhMucThuTuc } from '../dich-vu/danh-muc';
import { cauLoi } from '../dich-vu/goi-api';
import {
  LoiThieuThanhPhan,
  kiemNguoiNop,
  nopHoSo,
  thanhAnhGiayTo,
  tienDoMoi,
  type AnhGiayTo,
  type BuocNop,
  type NguoiNop,
} from '../dich-vu/nop-ho-so';
import { docThanhPhan, kiemThanhPhan, type ThanhPhan } from '../dich-vu/thanh-phan';
import type { CacManGoc } from '../dieu-huong/kieu';
import { usePhien } from '../kho/phien-dang-nhap';
import { KhungMan } from '../thanh-phan/khung-man';
import { ManTrangThai } from '../thanh-phan/man-trang-thai';
import { NutBam } from '../thanh-phan/nut-bam';
import { ONhap } from '../thanh-phan/o-nhap';
import { The } from '../thanh-phan/the';
import { YeuCauDangNhap } from '../thanh-phan/yeu-cau-dang-nhap';

type Props = NativeStackScreenProps<CacManGoc, 'NopHoSo'>;

const TUY_CHON_ANH = { mediaType: 'photo', maxWidth: 2000, maxHeight: 2000, quality: 0.8 } as const;

function MucGiayTo({
  tp,
  anh,
  loi,
  onThem,
  onBo,
}: {
  tp: ThanhPhan;
  anh: AnhGiayTo[];
  loi?: string;
  onThem: (nguon: 'may-anh' | 'thu-vien') => void;
  onBo: (uri: string) => void;
}) {
  const { t } = useTranslation();
  const day = tp.toiDa !== null && anh.length >= tp.toiDa;
  return (
    <View style={[kieu.muc, loi ? kieu.mucLoi : null]} testID={`giay-to-${tp.ma}`}>
      <Text style={kieu.tenMuc}>
        {tp.ten}
        <Text style={kieu.batBuoc}>{tp.batBuoc ? ` · ${t('thuTuc.batBuoc')}` : ` · ${t('thuTuc.neuCo')}`}</Text>
      </Text>
      {tp.moTa ? <Text style={kieu.moTa}>{tp.moTa}</Text> : null}
      {loi ? (
        <Text style={kieu.loi} accessibilityLiveRegion="polite">
          {loi}
        </Text>
      ) : null}
      {anh.length ? (
        <View style={kieu.luoiAnh}>
          {anh.map((a, i) => (
            <View key={a.uri} style={kieu.oAnh}>
              <Image source={{ uri: a.uri }} style={kieu.anh} accessibilityLabel={`${tp.ten} ${i + 1}`} />
              <Pressable
                onPress={() => onBo(a.uri)}
                style={kieu.nutBo}
                accessibilityRole="button"
                accessibilityLabel={t('nop.boAnh', { so: i + 1 })}
                hitSlop={8}>
                <X size={16} color={mau.chuTrenChinh} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      {!day ? (
        <View style={kieu.hangNut}>
          <Pressable style={kieu.nutAnh} onPress={() => onThem('may-anh')} accessibilityRole="button">
            <Camera size={20} color={mau.chuTrenChinhNhat} />
            <Text style={kieu.chuNutAnh}>{t('nop.chup')}</Text>
          </Pressable>
          <Pressable style={kieu.nutAnh} onPress={() => onThem('thu-vien')} accessibilityRole="button">
            <ImagePlus size={20} color={mau.chuTrenChinhNhat} />
            <Text style={kieu.chuNutAnh}>{t('nop.chon')}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

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
  const soAnh = useRef(0);

  const nop = useMutation({
    mutationFn: () =>
      nopHoSo(thuTuc!, nguoiNop, anh, tienDo.current, {
        layToken: () => usePhien.getState().layToken(),
        baoBuoc: setBuoc,
      }),
    onSuccess: hoSo => {
      boTruyVan.invalidateQueries({ queryKey: khoaTruyVan.hoSoCuaToi });
      navigation.replace('DaNop', { maHoSo: hoSo.ma_ho_so, hanXuLy: hoSo.han_xu_ly, tenThuTuc: thuTuc!.ten });
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

  async function themAnh(tp: ThanhPhan, nguon: 'may-anh' | 'thu-vien') {
    const conLai = tp.toiDa === null ? 10 : Math.max(1, tp.toiDa - (anh[tp.ma]?.length ?? 0));
    let kq: ImagePickerResponse;
    try {
      kq =
        nguon === 'may-anh'
          ? await launchCamera({ ...TUY_CHON_ANH, saveToPhotos: false })
          : await launchImageLibrary({ ...TUY_CHON_ANH, selectionLimit: conLai });
    } catch {
      Alert.alert(t('nop.loiAnhTieuDe'), t('nop.loiAnh'));
      return;
    }
    if (kq.didCancel) return;
    if (kq.errorCode) {
      Alert.alert(t('nop.loiAnhTieuDe'), kq.errorCode === 'camera_unavailable' ? t('nop.khongCoCamera') : t('nop.loiAnh'));
      return;
    }
    const moi: AnhGiayTo[] = [];
    for (const a of kq.assets ?? []) {
      const x = thanhAnhGiayTo(a, tp.ma, ++soAnh.current);
      if ('loi' in x) Alert.alert(t('nop.loiAnhTieuDe'), x.loi);
      else moi.push(x);
    }
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
        <ScrollView contentContainerStyle={kieu.noiDung} keyboardShouldPersistTaps="handled">
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
  moTa: { fontSize: chu.nho, color: mau.chuMo, lineHeight: 22 },
  form: { gap: khoang.l },
  muc: { gap: khoang.s, paddingBottom: khoang.l, borderBottomWidth: 1, borderBottomColor: mau.vien },
  mucLoi: { borderLeftWidth: 4, borderLeftColor: mau.loi, paddingLeft: khoang.m },
  tenMuc: { fontSize: chu.than, fontWeight: '700', color: mau.chu },
  batBuoc: { fontSize: chu.nho, fontWeight: '400', color: mau.chuMo },
  loi: { fontSize: chu.nho, color: mau.loi, fontWeight: '600' },
  luoiAnh: { flexDirection: 'row', flexWrap: 'wrap', gap: khoang.s },
  oAnh: { width: 88, height: 88 },
  anh: { width: 88, height: 88, borderRadius: bo.nho, backgroundColor: mau.mo },
  nutBo: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: mau.chu,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hangNut: { flexDirection: 'row', gap: khoang.s },
  nutAnh: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: khoang.s,
    borderRadius: bo.nho,
    backgroundColor: mau.chinhNhat,
  },
  chuNutAnh: { fontSize: chu.than, fontWeight: '600', color: mau.chuTrenChinhNhat },
  thongBaoLoi: { backgroundColor: mau.loiNhat, borderColor: mau.loi, gap: khoang.xs },
  tieuDeLoi: { fontSize: chu.than, fontWeight: '700', color: mau.loi },
  chuLoi: { fontSize: chu.than, color: mau.chu },
  buoc: { fontSize: chu.than, color: mau.chuMo, textAlign: 'center' },
});
