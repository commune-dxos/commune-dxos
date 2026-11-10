// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import React from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { bo, chu, khoang, mau } from '../giao-dien';

interface Props extends Omit<TextInputProps, 'style'> {
  nhan: string;
  goiY?: string;
  loi?: string;
}

/** Ô nhập có nhãn ở trên, gợi ý và lỗi ở dưới (kiểu form cổng công dân). */
export function ONhap({ nhan, goiY, loi, ...con }: Props) {
  return (
    <View style={kieu.goc}>
      <Text style={kieu.nhan}>{nhan}</Text>
      {goiY ? <Text style={kieu.goiY}>{goiY}</Text> : null}
      {loi ? (
        <Text style={kieu.loi} accessibilityLiveRegion="polite">
          {loi}
        </Text>
      ) : null}
      <TextInput
        accessibilityLabel={nhan}
        placeholderTextColor={mau.chuMo}
        style={[kieu.o, loi ? kieu.oLoi : null]}
        {...con}
      />
    </View>
  );
}

const kieu = StyleSheet.create({
  goc: { gap: khoang.xs },
  nhan: { fontSize: chu.than, fontWeight: '600', color: mau.chu },
  goiY: { fontSize: chu.nho, color: mau.chuMo },
  loi: { fontSize: chu.nho, color: mau.loi, fontWeight: '600' },
  o: {
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: mau.vienONhap,
    borderRadius: bo.vua,
    paddingHorizontal: khoang.m,
    fontSize: chu.lon,
    color: mau.chu,
    backgroundColor: mau.nen,
  },
  oLoi: { borderColor: mau.loi, borderWidth: 2 },
});
