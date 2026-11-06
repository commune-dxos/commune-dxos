// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Tham số của từng màn (React Navigation 7, kiểu tĩnh).
import type { NavigatorScreenParams } from '@react-navigation/native';

export type CacTab = {
  TaiKhoan: undefined;
};

export type CacManGoc = {
  Tab: NavigatorScreenParams<CacTab> | undefined;
};

declare global {
   
  namespace ReactNavigation {
    interface RootParamList extends CacManGoc {}
  }
}
