// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Trạng thái mạng của máy (NetInfo), dùng cho dải báo mất mạng và để TanStack Query tạm dừng khi
// không có mạng rồi tự tải lại khi có mạng (onlineManager).
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { create } from 'zustand';

interface TrangThaiMang {
  /** null = chưa biết (lúc mở app). */
  coMang: boolean | null;
  capNhat: (coMang: boolean | null) => void;
}

export const useMang = create<TrangThaiMang>(set => ({
  coMang: null,
  capNhat: coMang => set({ coMang }),
}));

/** isInternetReachable = null nghĩa là NetInfo chưa kiểm xong: coi theo isConnected. */
export function coMangTu(s: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean | null {
  if (s.isConnected === null) return null;
  if (!s.isConnected) return false;
  return s.isInternetReachable ?? true;
}

/** Gắn NetInfo vào kho và TanStack Query. Trả hàm gỡ. */
export function theoDoiMang() {
  const go = NetInfo.addEventListener(s => {
    const coMang = coMangTu(s);
    useMang.getState().capNhat(coMang);
    onlineManager.setOnline(coMang !== false);
  });
  return go;
}
