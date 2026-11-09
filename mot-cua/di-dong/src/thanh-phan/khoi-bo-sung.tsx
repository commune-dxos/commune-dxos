// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Bổ sung hồ sơ ngay trên app (KS01): yêu cầu của bộ phận một cửa, chụp/chọn thêm ảnh theo từng thành phần,
// ghi chú cho cán bộ, nộp lại. Lỗi giữa chừng thì ảnh đã tải được giữ, bấm lại chỉ gửi phần còn thiếu.
import React, { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Send, TriangleAlert } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { khoaTruyVan } from '../cau-hinh/truy-van';
import { bo, chu, dong, khoang, mau } from '../giao-dien';
import { GHI_CHU_TOI_DA, nopBoSung } from '../dich-vu/bo-sung';
import { cauLoi } from '../dich-vu/goi-api';
import { voiPhien, type HoSoCuaToi, type TepDaNop } from '../dich-vu/ho-so';
import { layIdThanhPhan, type AnhGiayTo } from '../dich-vu/nop-ho-so';
import { docThanhPhan, type ThanhPhan } from '../dich-vu/thanh-phan';
import { usePhien } from '../kho/phien-dang-nhap';
import { MucGiayTo, useChonAnh, type NguonAnh } from './muc-giay-to';
import { NutBam } from './nut-bam';
import { The } from './the';

interface Props {
  hoSo: HoSoCuaToi;
  tep: TepDaNop[] | null;
  /** Nộp lại xong: màn tải lại hồ sơ (trạng thái mới). */
  xong: () => void;
}

export function KhoiBoSung({ hoSo, tep, xong }: Props) {
  const { t } = useTranslation();
  const chonAnh = useChonAnh();
  const dsThanhPhan = docThanhPhan(hoSo.thu_tuc?.json_schema);
  const [anh, setAnh] = useState<Record<string, AnhGiayTo[]>>({});
  const [ghiChu, setGhiChu] = useState('');
  const [tienDoTai, setTienDoTai] = useState<{ thu: number; tong: number } | null>(null);
  const daTai = useRef(new Set<string>());
  const thuTucId = hoSo.thu_tuc?.id ?? '';
  // id thành phần, đọc qua route công khai, để đếm số tệp đã nộp của từng thành phần; lỗi thì chỉ bớt dòng phụ.
  const idThanhPhan = useQuery({
    queryKey: khoaTruyVan.idThanhPhan(thuTucId),
    queryFn: () => layIdThanhPhan(thuTucId),
    enabled: !!thuTucId,
    staleTime: 30 * 60_000,
  });

  const nop = useMutation({
    mutationFn: () =>
      voiPhien(() =>
        nopBoSung(hoSo.id, thuTucId, anh, ghiChu, daTai.current, {
          layToken: () => usePhien.getState().layToken(),
          baoTai: (thu, tong) => setTienDoTai({ thu, tong }),
        }),
      ),
    onSettled: () => setTienDoTai(null),
    onSuccess: xong,
  });

  async function themAnh(tp: ThanhPhan, nguon: NguonAnh) {
    const moi = await chonAnh(tp, nguon, anh[tp.ma]?.length ?? 0);
    if (moi.length) setAnh(cu => ({ ...cu, [tp.ma]: [...(cu[tp.ma] ?? []), ...moi] }));
  }

  const soTepDaNop = (ma: string) => {
    const id = idThanhPhan.data?.[ma];
    const n = id ? (tep ?? []).filter(f => f.thanh_phan_yeu_cau_id === id).length : 0;
    return n ? t('boSung.daNopTep', { so: n }) : undefined;
  };

  return (
    <The style={kieu.goc} testID="khoi-bo-sung">
      <View style={kieu.yeuCau}>
        <TriangleAlert size={24} color={mau.canhBao} />
        <View style={kieu.cot}>
          <Text style={kieu.tieuDeYeuCau} accessibilityRole="header">
            {t('boSung.yeuCau')}
          </Text>
          <Text style={kieu.chuYeuCau} testID="ly-do-bo-sung">
            {hoSo.ly_do || t('boSung.macDinh')}
          </Text>
        </View>
      </View>

      <Text style={kieu.goiY}>{t('boSung.goiY')}</Text>
      {dsThanhPhan.length ? (
        dsThanhPhan.map(tp => (
          <MucGiayTo
            key={tp.ma}
            tp={tp}
            anh={anh[tp.ma] ?? []}
            ghiChu={soTepDaNop(tp.ma)}
            khoa={nop.isPending}
            onThem={nguon => themAnh(tp, nguon)}
            onBo={uri => setAnh(cu => ({ ...cu, [tp.ma]: (cu[tp.ma] ?? []).filter(a => a.uri !== uri) }))}
          />
        ))
      ) : (
        <Text style={kieu.goiY}>{t('boSung.khongCoThanhPhan')}</Text>
      )}

      <View style={kieu.oGhiChu}>
        <Text style={kieu.nhan}>{t('boSung.ghiChu')}</Text>
        <TextInput
          value={ghiChu}
          onChangeText={setGhiChu}
          maxLength={GHI_CHU_TOI_DA}
          multiline
          editable={!nop.isPending}
          accessibilityLabel={t('boSung.ghiChu')}
          placeholder={t('boSung.ghiChuGoiY')}
          placeholderTextColor={mau.chuMo}
          style={kieu.o}
          testID="o-ghi-chu-bo-sung"
        />
      </View>

      {nop.isError ? (
        <Text style={kieu.loi} accessibilityLiveRegion="polite">
          {cauLoi(nop.error)}
        </Text>
      ) : null}
      {tienDoTai ? (
        <Text style={kieu.goiY} accessibilityLiveRegion="polite">
          {t('nop.dangTai', tienDoTai)}
        </Text>
      ) : null}
      <NutBam
        nhan={nop.isError ? t('chung.thuLai') : t('boSung.nopLai')}
        bieuTuong={Send}
        onPress={() => nop.mutate()}
        dangChay={nop.isPending}
        testID="nut-nop-lai"
      />
    </The>
  );
}

const kieu = StyleSheet.create({
  goc: { gap: khoang.l, borderColor: mau.canhBao, borderWidth: 2 },
  yeuCau: {
    flexDirection: 'row',
    gap: khoang.m,
    backgroundColor: mau.loiNhat,
    borderRadius: bo.vua,
    padding: khoang.m,
  },
  cot: { flex: 1, gap: khoang.xs },
  tieuDeYeuCau: { fontSize: chu.than, lineHeight: dong.than, fontWeight: '700', color: mau.loi },
  chuYeuCau: { fontSize: chu.than, lineHeight: dong.than, color: mau.chu },
  goiY: { fontSize: chu.nho, lineHeight: dong.nho, color: mau.chuMo },
  oGhiChu: { gap: khoang.xs },
  nhan: { fontSize: chu.than, fontWeight: '600', color: mau.chu },
  o: {
    minHeight: 96,
    borderWidth: 1.5,
    borderColor: mau.vienONhap,
    borderRadius: bo.vua,
    paddingHorizontal: khoang.m,
    paddingVertical: khoang.s,
    fontSize: chu.than,
    color: mau.chu,
    backgroundColor: mau.nen,
    textAlignVertical: 'top',
  },
  loi: { fontSize: chu.than, lineHeight: dong.than, color: mau.loi, fontWeight: '600' },
});
