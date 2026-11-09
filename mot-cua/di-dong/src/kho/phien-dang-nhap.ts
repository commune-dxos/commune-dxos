// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Kho phiên đăng nhập của công dân (Zustand). Không dùng zustand/persist: token chỉ nằm trong Keychain
// (dich-vu/xac-thuc.ts). Màn cần gọi API có đăng nhập lấy token qua layToken(): còn hạn thì trả ngay,
// sắp hết hạn thì làm mới một lần cho mọi lời gọi đang chờ; làm mới hỏng thì xóa phiên và báo hết phiên.
import { create } from 'zustand';
import { HET_PHIEN, LoiApi } from '../dich-vu/goi-api';
import {
  conHan,
  dangNhapOidc,
  dangXuatOidc,
  docNguoiDung,
  docPhien,
  laHuyDangNhap,
  lamMoiOidc,
  luuPhien,
  xoaPhien,
  type NguoiDung,
  type Phien,
} from '../dich-vu/xac-thuc';

interface TrangThaiPhien {
  phien: Phien | null;
  nguoiDung: NguoiDung | null;
  /** true cho tới khi đọc xong Keychain lúc mở app. */
  dangKhoiPhuc: boolean;
  dangXuLy: boolean;
  /** Câu báo lỗi cho người dân của lần đăng nhập gần nhất. */
  loi: string | null;
  khoiPhuc: () => Promise<void>;
  dangNhap: () => Promise<boolean>;
  dangXuat: () => Promise<void>;
  layToken: () => Promise<string>;
  /** Máy chủ từ chối token (401): bỏ phiên, báo hết phiên ở màn đăng nhập. */
  hetPhien: () => Promise<void>;
}

let dangLamMoi: Promise<Phien> | null = null;

function datPhien(phien: Phien | null) {
  return { phien, nguoiDung: phien ? docNguoiDung(phien.accessToken) : null };
}

export const usePhien = create<TrangThaiPhien>((set, get) => {
  async function lamMoi(phien: Phien) {
    dangLamMoi ??= lamMoiOidc(phien)
      .then(async moi => {
        await luuPhien(moi);
        set(datPhien(moi));
        return moi;
      })
      .finally(() => {
        dangLamMoi = null;
      });
    return dangLamMoi;
  }

  async function boPhien() {
    await xoaPhien().catch(() => undefined);
    set(datPhien(null));
  }

  return {
    phien: null,
    nguoiDung: null,
    dangKhoiPhuc: true,
    dangXuLy: false,
    loi: null,

    async khoiPhuc() {
      try {
        const phien = await docPhien();
        if (!phien) {
          set(datPhien(null));
        } else if (conHan(phien)) {
          set(datPhien(phien));
        } else if (phien.refreshToken) {
          await lamMoi(phien).catch(boPhien);
        } else {
          await boPhien();
        }
      } catch {
        set(datPhien(null));
      } finally {
        set({ dangKhoiPhuc: false });
      }
    },

    async dangNhap() {
      set({ dangXuLy: true, loi: null });
      try {
        const phien = await dangNhapOidc();
        await luuPhien(phien);
        set({ ...datPhien(phien), dangXuLy: false });
        return true;
      } catch (e) {
        set({
          dangXuLy: false,
          loi: laHuyDangNhap(e)
            ? null
            : 'Chưa đăng nhập được. Vui lòng kiểm tra mạng rồi thử lại, hoặc đăng nhập trên cổng công dân web.',
        });
        return false;
      }
    },

    async dangXuat() {
      const phien = get().phien;
      set({ dangXuLy: true });
      if (phien) await dangXuatOidc(phien).catch(() => undefined);
      await boPhien();
      set({ dangXuLy: false, loi: null });
    },

    async hetPhien() {
      if (!get().phien) return;
      await boPhien();
      set({ loi: HET_PHIEN });
    },

    async layToken() {
      const phien = get().phien;
      if (!phien) throw new LoiApi('Vui lòng đăng nhập để tiếp tục.', 401);
      if (conHan(phien)) return phien.accessToken;
      try {
        return (await lamMoi(phien)).accessToken;
      } catch {
        await boPhien();
        set({ loi: HET_PHIEN });
        throw new LoiApi(HET_PHIEN, 401);
      }
    },
  };
});
