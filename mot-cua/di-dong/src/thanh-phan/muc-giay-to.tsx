// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Một thành phần hồ sơ: tên, gợi ý, ảnh đã chọn (bỏ được), nút chụp / chọn ảnh. Dùng ở màn nộp hồ sơ và khối
// bổ sung hồ sơ. chonAnh() mở camera hoặc thư viện, đổi kết quả thành AnhGiayTo, báo lỗi bằng hộp thoại.
import React, { useCallback, useRef } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Camera, ImagePlus, X } from 'lucide-react-native';
import { launchCamera, launchImageLibrary, type ImagePickerResponse } from 'react-native-image-picker';
import { useTranslation } from 'react-i18next';
import { bo, chu, dong, khoang, mau, VUNG_BAM } from '../giao-dien';
import { thanhAnhGiayTo, type AnhGiayTo } from '../dich-vu/nop-ho-so';
import type { ThanhPhan } from '../dich-vu/thanh-phan';

export type NguonAnh = 'may-anh' | 'thu-vien';

const TUY_CHON_ANH = { mediaType: 'photo', maxWidth: 2000, maxHeight: 2000, quality: 0.8 } as const;

/** Mở camera / thư viện cho một thành phần; trả các ảnh hợp lệ (rỗng nếu hủy hoặc lỗi). */
export function useChonAnh() {
  const { t } = useTranslation();
  const soAnh = useRef(0);
  return useCallback(
    async (tp: ThanhPhan, nguon: NguonAnh, daCo: number): Promise<AnhGiayTo[]> => {
      const conLai = tp.toiDa === null ? 10 : Math.max(1, tp.toiDa - daCo);
      let kq: ImagePickerResponse;
      try {
        kq =
          nguon === 'may-anh'
            ? await launchCamera({ ...TUY_CHON_ANH, saveToPhotos: false })
            : await launchImageLibrary({ ...TUY_CHON_ANH, selectionLimit: conLai });
      } catch {
        Alert.alert(t('nop.loiAnhTieuDe'), t('nop.loiAnh'));
        return [];
      }
      if (kq.didCancel) return [];
      if (kq.errorCode) {
        Alert.alert(t('nop.loiAnhTieuDe'), kq.errorCode === 'camera_unavailable' ? t('nop.khongCoCamera') : t('nop.loiAnh'));
        return [];
      }
      const moi: AnhGiayTo[] = [];
      for (const a of kq.assets ?? []) {
        const x = thanhAnhGiayTo(a, tp.ma, ++soAnh.current);
        if ('loi' in x) Alert.alert(t('nop.loiAnhTieuDe'), x.loi);
        else moi.push(x);
      }
      return moi;
    },
    [t],
  );
}

export function MucGiayTo({
  tp,
  anh,
  loi,
  ghiChu,
  khoa,
  onThem,
  onBo,
}: {
  tp: ThanhPhan;
  anh: AnhGiayTo[];
  loi?: string;
  /** Dòng phụ dưới tên, vd "Đã nộp 2 tệp" ở khối bổ sung. */
  ghiChu?: string;
  /** Đang gửi: không thêm, bỏ ảnh được. */
  khoa?: boolean;
  onThem: (nguon: NguonAnh) => void;
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
      {ghiChu ? <Text style={kieu.moTa}>{ghiChu}</Text> : null}
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
              {!khoa ? (
                <Pressable
                  onPress={() => onBo(a.uri)}
                  style={kieu.nutBo}
                  accessibilityRole="button"
                  accessibilityLabel={t('nop.boAnh', { so: i + 1 })}
                  hitSlop={8}>
                  <X size={18} color={mau.chuTrenChinh} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      {!day && !khoa ? (
        <View style={kieu.hangNut}>
          <Pressable
            style={({ pressed }) => [kieu.nutAnh, pressed && kieu.nutAnhNhan]}
            onPress={() => onThem('may-anh')}
            accessibilityRole="button"
            accessibilityLabel={`${t('nop.chup')}: ${tp.ten}`}>
            <Camera size={22} color={mau.chuTrenChinhNhat} />
            <Text style={kieu.chuNutAnh}>{t('nop.chup')}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [kieu.nutAnh, pressed && kieu.nutAnhNhan]}
            onPress={() => onThem('thu-vien')}
            accessibilityRole="button"
            accessibilityLabel={`${t('nop.chon')}: ${tp.ten}`}>
            <ImagePlus size={22} color={mau.chuTrenChinhNhat} />
            <Text style={kieu.chuNutAnh}>{t('nop.chon')}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const kieu = StyleSheet.create({
  muc: { gap: khoang.s, paddingBottom: khoang.l, borderBottomWidth: 1, borderBottomColor: mau.vien },
  mucLoi: { borderLeftWidth: 4, borderLeftColor: mau.canhBao, paddingLeft: khoang.m },
  tenMuc: { fontSize: chu.than, lineHeight: dong.than, fontWeight: '700', color: mau.chu },
  batBuoc: { fontSize: chu.nho, fontWeight: '400', color: mau.chuMo },
  moTa: { fontSize: chu.nho, color: mau.chuMo, lineHeight: dong.nho },
  loi: { fontSize: chu.nho, lineHeight: dong.nho, color: mau.loi, fontWeight: '600' },
  luoiAnh: { flexDirection: 'row', flexWrap: 'wrap', gap: khoang.m, paddingTop: khoang.xs },
  oAnh: { width: 96, height: 96 },
  anh: { width: 96, height: 96, borderRadius: bo.vua, backgroundColor: mau.mo },
  nutBo: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: mau.chu,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hangNut: { flexDirection: 'row', gap: khoang.s },
  nutAnh: {
    flex: 1,
    minHeight: VUNG_BAM + 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: khoang.s,
    borderRadius: bo.tron,
    backgroundColor: mau.chinhNhat,
    borderWidth: 1,
    borderColor: mau.vienChinhNhat,
  },
  nutAnhNhan: { backgroundColor: mau.chinhNhatNhan },
  chuNutAnh: { fontSize: chu.than, fontWeight: '700', color: mau.chuTrenChinhNhat },
});
