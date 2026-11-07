// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Gốc của app: ngôn ngữ, bộ truy vấn, theo dõi mạng, điều hướng.
import React, { useEffect, useState } from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer, type Theme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { taoBoTruyVan } from './cau-hinh/truy-van';
import { DieuHuongGoc } from './dieu-huong';
import { mau } from './giao-dien';
import { theoDoiMang } from './kho/mang';
import { usePhien } from './kho/phien-dang-nhap';
import { khoiTaoNgonNgu } from './ngon-ngu';

khoiTaoNgonNgu();

const giaoDienDieuHuong: Theme = {
  dark: false,
  colors: {
    primary: mau.chinh,
    background: mau.nenPhu,
    card: mau.nen,
    text: mau.chu,
    border: mau.vien,
    notification: mau.canhBao,
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' },
    medium: { fontFamily: 'System', fontWeight: '500' },
    bold: { fontFamily: 'System', fontWeight: '700' },
    heavy: { fontFamily: 'System', fontWeight: '800' },
  },
};

export default function UngDung() {
  const [boTruyVan] = useState(taoBoTruyVan);
  useEffect(() => theoDoiMang(), []);
  useEffect(() => {
    usePhien.getState().khoiPhuc();
  }, []);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={boTruyVan}>
        <StatusBar barStyle="dark-content" backgroundColor={mau.nen} />
        <NavigationContainer theme={giaoDienDieuHuong}>
          <DieuHuongGoc />
        </NavigationContainer>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
