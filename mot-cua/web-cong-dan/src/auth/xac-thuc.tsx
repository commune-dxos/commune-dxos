// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Trạng thái đăng nhập dùng chung. Xem danh mục không cần đăng nhập; nộp hồ sơ (#53) và tra cứu
// (#54) cần access token, lấy qua `nguoiDung.access_token` để gọi /workflow, /api, /files.
import type { User, UserManager } from "oidc-client-ts";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { cauHinh } from "@/lib/cau-hinh";

/** Khóa sessionStorage giữ người dùng "vào vai" ở trang cổng cán bộ khi chạy dữ liệu giả. */
export const KHOA_NGUOI_DUNG_DEMO = "dxos_demo_user";

/** Người dùng vào vai chỉ có hiệu lực ở chế độ dữ liệu giả. Ở chế độ thật, khóa còn sót lại
 *  bị xóa và bỏ qua để không ai tự đặt token giả qua sessionStorage. */
export function docNguoiDungDemo(duLieuGia: boolean): User | null {
  if (typeof window === "undefined") return null;
  if (!duLieuGia) {
    sessionStorage.removeItem(KHOA_NGUOI_DUNG_DEMO);
    return null;
  }
  const json = sessionStorage.getItem(KHOA_NGUOI_DUNG_DEMO);
  if (!json) return null;
  try {
    return JSON.parse(json) as User;
  } catch {
    sessionStorage.removeItem(KHOA_NGUOI_DUNG_DEMO);
    return null;
  }
}

interface XacThuc {
  nguoiDung: User | null;
  dangTai: boolean;
  dangNhap: (quayVe?: string) => Promise<void>;
  dangXuat: () => Promise<void>;
  /** Gọi ở trang DUONG_DAN_XONG; trả đường dẫn cần quay về. */
  hoanTatDangNhap: () => Promise<string>;
}

const NguCanh = createContext<XacThuc | null>(null);

export function tenHienThi(nguoiDung: User) {
  const p = nguoiDung.profile;
  return p.name || p.preferred_username || "Công dân";
}

export function XacThucProvider({
  quanLy,
  children,
  duLieuGia = cauHinh.duLieuGia,
}: {
  quanLy: UserManager;
  children: ReactNode;
  duLieuGia?: boolean;
}) {
  const [nguoiDung, datNguoiDung] = useState<User | null>(null);
  const [dangTai, datDangTai] = useState(true);

  useEffect(() => {
    let conGanKet = true;
    const demo = docNguoiDungDemo(duLieuGia);
    if (demo) {
      datNguoiDung(demo);
      datDangTai(false);
      return;
    }
    quanLy
      .getUser()
      .then((u) => conGanKet && datNguoiDung(u && !u.expired ? u : null))
      .catch(() => conGanKet && datNguoiDung(null))
      .finally(() => conGanKet && datDangTai(false));
    const khiNap = (u: User) => datNguoiDung(u);
    const khiBo = () => datNguoiDung(null);
    quanLy.events.addUserLoaded(khiNap);
    quanLy.events.addUserUnloaded(khiBo);
    quanLy.events.addUserSignedOut(khiBo);
    return () => {
      conGanKet = false;
      quanLy.events.removeUserLoaded(khiNap);
      quanLy.events.removeUserUnloaded(khiBo);
      quanLy.events.removeUserSignedOut(khiBo);
    };
  }, [quanLy, duLieuGia]);

  const giaTri = useMemo<XacThuc>(
    () => ({
      nguoiDung,
      dangTai,
      dangNhap: (quayVe = window.location.pathname) => quanLy.signinRedirect({ state: { quayVe } }),
      dangXuat: async () => {
        if (typeof window !== "undefined") sessionStorage.removeItem(KHOA_NGUOI_DUNG_DEMO);
        return quanLy.signoutRedirect();
      },
      hoanTatDangNhap: async () => {
        const u = await quanLy.signinRedirectCallback();
        datNguoiDung(u);
        const quayVe = (u.state as { quayVe?: string } | undefined)?.quayVe;
        // Chỉ quay về đường dẫn trong cổng, không theo URL ngoài.
        return quayVe && quayVe.startsWith("/") && !quayVe.startsWith("//") ? quayVe : "/";
      },
    }),
    [quanLy, nguoiDung, dangTai],
  );

  return <NguCanh.Provider value={giaTri}>{children}</NguCanh.Provider>;
}

export function useXacThuc() {
  const v = useContext(NguCanh);
  if (!v) throw new Error("useXacThuc phải nằm trong <XacThucProvider>");
  return v;
}
