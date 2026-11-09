// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Tra cứu hồ sơ không cần đăng nhập: mã hồ sơ trên biên nhận + 4 số cuối số điện thoại.
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { chu, dong, khoang, mau } from '../giao-dien';
import { ngay } from '../dich-vu/dinh-dang';
import { cauLoi } from '../dich-vu/goi-api';
import { kiemNhapTraCuu, traCuuCongKhai, type KetQuaTraCuu } from '../dich-vu/tra-cuu';
import { KhungMan } from '../thanh-phan/khung-man';
import { ManTrangThai } from '../thanh-phan/man-trang-thai';
import { MocTrangThai } from '../thanh-phan/moc-trang-thai';
import { NhanTrangThai } from '../thanh-phan/nhan-trang-thai';
import { NutBam } from '../thanh-phan/nut-bam';
import { ONhap } from '../thanh-phan/o-nhap';
import { The } from '../thanh-phan/the';

function KetQua({ kq }: { kq: KetQuaTraCuu }) {
  const { t } = useTranslation();
  return (
    <The testID="ket-qua-tra-cuu">
      <View style={kieu.khoi}>
        <Text style={kieu.nhan}>{t('traCuu.maHoSo')}</Text>
        <Text style={kieu.ma} selectable>
          {kq.ma_ho_so}
        </Text>
        <Text style={kieu.tenThuTuc}>{kq.thu_tuc.ten}</Text>
        <NhanTrangThai ma={kq.trang_thai} />
        <View style={kieu.hang}>
          <View style={kieu.o}>
            <Text style={kieu.nhan}>{t('hoSo.ngayNhan')}</Text>
            <Text style={kieu.giaTri}>{ngay(kq.ngay_nhan)}</Text>
          </View>
          <View style={kieu.o}>
            <Text style={kieu.nhan}>{kq.ngay_hoan_tat ? t('hoSo.ngayHoanTat') : t('hoSo.hanXuLy')}</Text>
            <Text style={kieu.giaTri}>{ngay(kq.ngay_hoan_tat ?? kq.han_xu_ly) || '—'}</Text>
          </View>
        </View>
      </View>
      {kq.lich_su.length ? (
        <View style={kieu.lichSu}>
          <Text style={kieu.tieuDeMuc}>{t('hoSo.cacMoc')}</Text>
          <MocTrangThai cacMoc={kq.lich_su.map(m => ({ trangThai: m.trang_thai, luc: m.luc, lyDo: m.ly_do }))} />
        </View>
      ) : null}
    </The>
  );
}

export function ManTraCuu() {
  const { t } = useTranslation();
  const [ma, setMa] = useState('');
  const [soCuoi, setSoCuoi] = useState('');
  const [loiNhap, setLoiNhap] = useState<{ ma?: string; soCuoi?: string }>({});
  const traCuu = useMutation({ mutationFn: (v: { ma: string; soCuoi: string }) => traCuuCongKhai(v.ma, v.soCuoi) });

  function gui() {
    const loi = kiemNhapTraCuu(ma, soCuoi);
    setLoiNhap(loi);
    if (!loi.ma && !loi.soCuoi) traCuu.mutate({ ma, soCuoi });
  }

  return (
    <KhungMan>
      <KeyboardAvoidingView style={kieu.lap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={kieu.noiDung} keyboardShouldPersistTaps="handled">
          <Text style={kieu.gioiThieu}>{t('traCuu.gioiThieu')}</Text>
          <The style={kieu.form}>
            <ONhap
              nhan={t('traCuu.maHoSo')}
              goiY={t('traCuu.goiYMa')}
              loi={loiNhap.ma}
              value={ma}
              onChangeText={setMa}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="HS20261024-000123"
              testID="o-ma-ho-so"
            />
            <ONhap
              nhan={t('traCuu.soCuoi')}
              loi={loiNhap.soCuoi}
              value={soCuoi}
              onChangeText={x => setSoCuoi(x.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="1234"
              testID="o-so-cuoi"
            />
            <NutBam nhan={t('traCuu.nut')} onPress={gui} dangChay={traCuu.isPending} testID="nut-tra-cuu" />
          </The>

          {traCuu.isError ? (
            <ManTrangThai
              loai="loi"
              tieuDe={t('traCuu.loi')}
              moTa={cauLoi(traCuu.error)}
              onThuLai={() => traCuu.variables && traCuu.mutate(traCuu.variables)}
            />
          ) : traCuu.isSuccess && !traCuu.data ? (
            <ManTrangThai loai="trong" tieuDe={t('traCuu.khongThay')} moTa={t('traCuu.khongThayMoTa')} />
          ) : traCuu.data ? (
            <KetQua kq={traCuu.data} />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </KhungMan>
  );
}

const kieu = StyleSheet.create({
  lap: { flex: 1 },
  noiDung: { padding: khoang.l, gap: khoang.l, paddingBottom: khoang.xxl },
  gioiThieu: { fontSize: chu.than, color: mau.chuMo, lineHeight: dong.than },
  form: { gap: khoang.l },
  khoi: { gap: khoang.s },
  nhan: { fontSize: chu.nho, color: mau.chuMo },
  ma: { fontSize: chu.tieuDe, fontWeight: '800', color: mau.chu, letterSpacing: 0.5 },
  tenThuTuc: { fontSize: chu.lon, fontWeight: '600', color: mau.chu },
  hang: { flexDirection: 'row', gap: khoang.l, marginTop: khoang.s },
  o: { flex: 1, gap: 2 },
  giaTri: { fontSize: chu.than, fontWeight: '700', color: mau.chu },
  lichSu: { marginTop: khoang.l, gap: khoang.m },
  tieuDeMuc: { fontSize: chu.lon, fontWeight: '700', color: mau.chu },
});
