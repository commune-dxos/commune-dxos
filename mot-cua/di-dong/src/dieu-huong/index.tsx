// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Điều hướng: stack gốc chứa các tab chính; màn chi tiết đẩy lên stack gốc để che thanh tab.
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { FileText, FolderOpen, Search, UserRound, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { chu, mau } from '../giao-dien';
import { ManChiTietHoSo } from '../man-hinh/chi-tiet-ho-so';
import { ManChiTietThuTuc } from '../man-hinh/chi-tiet-thu-tuc';
import { ManDaNop } from '../man-hinh/da-nop';
import { ManDanhSachThuTuc } from '../man-hinh/danh-sach-thu-tuc';
import { ManHoSoCuaToi } from '../man-hinh/ho-so-cua-toi';
import { ManNopHoSo } from '../man-hinh/nop-ho-so';
import { ManTaiKhoan } from '../man-hinh/tai-khoan';
import { ManTraCuu } from '../man-hinh/tra-cuu';
import type { CacManGoc, CacTab } from './kieu';

const Tab = createBottomTabNavigator<CacTab>();

/** Biểu tượng tab dựng ở cấp mô-đun để React không tạo component mới mỗi lần vẽ. */
function bieuTuongTab(BieuTuong: LucideIcon) {
  return ({ color, size }: { color: string; size: number }) => <BieuTuong color={color} size={size} />;
}
const BIEU_TUONG = {
  ThuTuc: bieuTuongTab(FileText),
  TraCuu: bieuTuongTab(Search),
  HoSoCuaToi: bieuTuongTab(FolderOpen),
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
        tabBarLabelStyle: { fontSize: 14, fontWeight: '600' },
        headerTitleStyle: { fontSize: chu.lon, fontWeight: '700', color: mau.chu },
        headerShadowVisible: false,
        tabBarStyle: { minHeight: 68, paddingTop: 4, borderTopColor: mau.vien },
      }}>
      <Tab.Screen
        name="ThuTuc"
        component={ManDanhSachThuTuc}
        options={{ title: t('tab.thuTuc'), headerTitle: t('ungDung.ten'), tabBarIcon: BIEU_TUONG.ThuTuc }}
      />
      <Tab.Screen
        name="TraCuu"
        component={ManTraCuu}
        options={{ title: t('tab.traCuu'), headerTitle: t('man.traCuu'), tabBarIcon: BIEU_TUONG.TraCuu }}
      />
      <Tab.Screen
        name="HoSoCuaToi"
        component={ManHoSoCuaToi}
        options={{ title: t('tab.hoSo'), tabBarIcon: BIEU_TUONG.HoSoCuaToi }}
      />
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
  const { t } = useTranslation();
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
      <Goc.Screen name="ChiTietThuTuc" component={ManChiTietThuTuc} options={{ title: t('man.chiTietThuTuc') }} />
      <Goc.Screen name="ChiTietHoSo" component={ManChiTietHoSo} options={{ title: t('man.chiTietHoSo') }} />
      <Goc.Screen name="NopHoSo" component={ManNopHoSo} options={{ title: t('man.nopHoSo') }} />
      <Goc.Screen name="DaNop" component={ManDaNop} options={{ title: t('man.daNop'), headerBackVisible: false }} />
    </Goc.Navigator>
  );
}
