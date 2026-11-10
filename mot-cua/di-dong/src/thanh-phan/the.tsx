// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { bo, bong, khoang, mau } from '../giao-dien';

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  nhanTroNang?: string;
  testID?: string;
}

/** Thẻ nền trắng viền mảnh; có onPress thì bấm được cả thẻ. */
export function The({ children, onPress, style, nhanTroNang, testID }: Props) {
  if (!onPress) return <View style={[kieuThe.goc, style]} testID={testID}>{children}</View>;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={nhanTroNang}
      onPress={onPress}
      style={({ pressed }) => [kieuThe.goc, pressed && kieuThe.nhan, style]}>
      {children}
    </Pressable>
  );
}

const kieuThe = StyleSheet.create({
  goc: {
    backgroundColor: mau.the,
    borderRadius: bo.the,
    borderWidth: 1,
    borderColor: mau.vien,
    padding: khoang.l,
    ...bong,
  },
  nhan: { backgroundColor: mau.mo },
});
