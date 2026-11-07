// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// i18next: app chỉ có tiếng Việt (công dân của xã). Chuỗi giao diện nằm ở vi.json để dễ rà câu chữ.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import vi from './vi.json';

export function khoiTaoNgonNgu() {
  if (!i18n.isInitialized) {
    i18n.use(initReactI18next).init({
      lng: 'vi',
      fallbackLng: 'vi',
      resources: { vi: { translation: vi } },
      interpolation: { escapeValue: false },
      returnNull: false,
    });
  }
  return i18n;
}

export default i18n;
