// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Nút tải biên nhận / thông báo kết quả PDF có ký số (#77). Bấm → mot-cua-api phát hành nếu chưa có → mở
// link bằng trình duyệt của máy để tải PDF. Lỗi tạm thời (Gotenberg, CA chưa sẵn sàng) hiện câu tiếng Việt và
// cho bấm lại.
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BadgeCheck, Download } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { chu, dong, khoang, mau } from '../giao-dien';
import { taiGiayTo, type GiayToKy, type LoaiGiayTo } from '../dich-vu/giay-to';
import { cauLoi } from '../dich-vu/goi-api';
import { voiPhien } from '../dich-vu/ho-so';
import { NutBam } from './nut-bam';

interface Props {
  hoSoId: string;
  loai: LoaiGiayTo;
  /** Thay cho test: mở link (mặc định Linking.openURL). */
  mo?: (url: string) => Promise<unknown>;
}

export function NutGiayTo({ hoSoId, loai, mo }: Props) {
  const { t } = useTranslation();
  const [dangLay, setDangLay] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [daTai, setDaTai] = useState<GiayToKy | null>(null);

  async function bam() {
    setDangLay(true);
    setLoi(null);
    try {
      setDaTai(await voiPhien(token => taiGiayTo(async () => token, hoSoId, loai, mo)));
    } catch (e) {
      setLoi(cauLoi(e));
    } finally {
      setDangLay(false);
    }
  }

  return (
    <View style={kieu.goc}>
      <NutBam
        nhan={dangLay ? t('giayTo.dangChuanBi') : t(loai === 'bien_nhan' ? 'giayTo.taiBienNhan' : 'giayTo.taiKetQua')}
        kieu={loai === 'ket_qua' ? 'chinh' : 'phu'}
        bieuTuong={Download}
        dangChay={dangLay}
        onPress={bam}
        testID={`nut-giay-to-${loai}`}
      />
      {daTai ? (
        <View style={kieu.daKy} accessibilityLiveRegion="polite">
          <BadgeCheck size={22} color={mau.chinh} />
          <Text style={kieu.chuDaKy}>{t('giayTo.daKy', { ten: daTai.chung_thu_ten })}</Text>
        </View>
      ) : null}
      {loi ? (
        <Text style={kieu.loi} accessibilityLiveRegion="polite">
          {loi}
        </Text>
      ) : null}
    </View>
  );
}

const kieu = StyleSheet.create({
  goc: { gap: khoang.s },
  daKy: { flexDirection: 'row', gap: khoang.s, alignItems: 'flex-start' },
  chuDaKy: { flex: 1, fontSize: chu.nho, lineHeight: dong.nho, color: mau.chuMo },
  loi: { fontSize: chu.nho, lineHeight: dong.nho, color: mau.loi, fontWeight: '600' },
});
