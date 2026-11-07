// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { coMangTu, theoDoiMang, useMang } from '../src/kho/mang';

describe('kho trạng thái mạng', () => {
  it('suy có mạng từ NetInfo', () => {
    expect(coMangTu({ isConnected: null, isInternetReachable: null })).toBeNull();
    expect(coMangTu({ isConnected: false, isInternetReachable: null })).toBe(false);
    expect(coMangTu({ isConnected: true, isInternetReachable: null })).toBe(true);
    expect(coMangTu({ isConnected: true, isInternetReachable: false })).toBe(false);
  });

  it('NetInfo báo mất mạng → kho và TanStack Query cùng chuyển sang ngoại tuyến', () => {
    const go = theoDoiMang();
    const ngheMang = (NetInfo.addEventListener as jest.Mock).mock.calls[0][0];
    ngheMang({ isConnected: false, isInternetReachable: false });
    expect(useMang.getState().coMang).toBe(false);
    expect(onlineManager.isOnline()).toBe(false);
    ngheMang({ isConnected: true, isInternetReachable: true });
    expect(useMang.getState().coMang).toBe(true);
    expect(onlineManager.isOnline()).toBe(true);
    expect(typeof go).toBe('function');
  });
});
