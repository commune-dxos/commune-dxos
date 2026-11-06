// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Điều hướng: stack gốc chứa các tab chính; màn chi tiết đẩy lên stack gốc để che thanh tab.
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { UserRound, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { chu, mau } from '../giao-dien';
import { ManTaiKhoan } from '../man-hinh/tai-khoan';
import type { CacManGoc, CacTab } from './kieu';

const Tab = createBottomTabNavigator<CacTab>();

/** Biểu tượng tab dựng ở cấp mô-đun để React không tạo component mới mỗi lần vẽ. */
function bieuTuongTab(BieuTuong: LucideIcon) {
  return ({ color, size }: { color: string; size: number }) => <BieuTuong color={color} size={size} />;
}
const BIEU_TUONG = {
  TaiKhoan: bieuTuongTab(UserRound),
};
const Goc = createNativeStackNavigator<CacManGoc>();

function CacTabChinh() {
  const { t } = useTranslation();
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: mau.chinh,
        tabBarInactiveTintColor: mau.chuMo,
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
        headerTitleStyle: { fontSize: chu.lon, fontWeight: '700', color: mau.chu },
        headerShadowVisible: false,
        tabBarStyle: { minHeight: 64 },
      }}>
      <Tab.Screen
        name="TaiKhoan"
        component={ManTaiKhoan}
        options={{
          title: t('tab.taiKhoan'),
          tabBarIcon: BIEU_TUONG.TaiKhoan,
        }}
      />
    </Tab.Navigator>
  );
}

export function DieuHuongGoc() {
  return (
    <Goc.Navigator
      screenOptions={{
        headerTintColor: mau.chinh,
        headerTitleStyle: { fontSize: chu.lon, fontWeight: '700', color: mau.chu },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: mau.nenPhu },
        headerBackButtonDisplayMode: 'minimal',
      }}>
      <Goc.Screen name="Tab" component={CacTabChinh} options={{ headerShown: false }} />
    </Goc.Navigator>
  );
}
