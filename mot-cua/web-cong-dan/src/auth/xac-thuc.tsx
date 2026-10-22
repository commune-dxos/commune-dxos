// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Trạng thái đăng nhập dùng chung. Xem danh mục không cần đăng nhập; nộp hồ sơ (#53) và tra cứu
// (#54) cần access token, lấy qua `nguoiDung.access_token` để gọi /workflow, /api, /files.
import type { User, UserManager } from "oidc-client-ts";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

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

export function XacThucProvider({ quanLy, children }: { quanLy: UserManager; children: ReactNode }) {
  const [nguoiDung, datNguoiDung] = useState<User | null>(null);
  const [dangTai, datDangTai] = useState(true);

  useEffect(() => {
    let conGanKet = true;
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
  }, [quanLy]);

  const giaTri = useMemo<XacThuc>(
    () => ({
      nguoiDung,
      dangTai,
      dangNhap: (quayVe = window.location.pathname) => quanLy.signinRedirect({ state: { quayVe } }),
      dangXuat: () => quanLy.signoutRedirect(),
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
