// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { mau } from '../giao-dien';
import { DaiMatMang } from './dai-mat-mang';

/** Khung của mọi màn: nền nhạt, dải báo mất mạng ngay dưới thanh tiêu đề. */
export function KhungMan({ children }: { children: React.ReactNode }) {
  return (
    <View style={kieu.goc}>
      <DaiMatMang />
      {children}
    </View>
  );
}

const kieu = StyleSheet.create({ goc: { flex: 1, backgroundColor: mau.nenPhu } });
