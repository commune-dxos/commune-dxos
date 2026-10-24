// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Dữ liệu dùng chung của cổng cán bộ: hộp việc (task + hồ sơ), thông tin người đăng nhập, đồng hồ để
// tính hạn. Tải lại mỗi phút và sau mỗi lần xử lý bước; thanh bên, chuông thông báo và các trang cùng
// đọc một bản. Đẩy cảnh báo realtime qua RabbitMQ là #56.
import type { User } from "oidc-client-ts";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiCanBo, type CanBo } from "./lib/api";
import { ghepViec, type Viec } from "./lib/hop-viec";
import type { VaiTroCanBo } from "./lib/quyen";

const CHU_KY_TAI_LAI_MS = 60_000;

interface DuLieuCanBo {
  api: ApiCanBo;
  nguoiDung: User;
  vaiTro: VaiTroCanBo;
  canBo: CanBo | null;
  viec: Viec[];
  dangTai: boolean;
  loi: string | null;
  bayGio: Date;
  taiLai: () => Promise<void>;
  /** Hồ sơ đang mở ở trang chi tiết (đường dẫn đầu trang vẫn ghi mã khi hồ sơ đã rời hộp việc). */
  hoSoDangXem: { id: string; ma: string } | null;
  datHoSoDangXem: (h: { id: string; ma: string } | null) => void;
}

const NguCanh = createContext<DuLieuCanBo | null>(null);

export function DuLieuCanBoProvider({
  nguoiDung,
  vaiTro,
  api: apiNgoai,
  children,
}: {
  nguoiDung: User;
  vaiTro: VaiTroCanBo;
  /** Cho test; mặc định gọi APISIX bằng access token của người dùng. */
  api?: ApiCanBo;
  children: ReactNode;
}) {
  const api = useMemo(() => apiNgoai ?? new ApiCanBo(nguoiDung.access_token), [apiNgoai, nguoiDung.access_token]);
  const sub = nguoiDung.profile.sub;
  const [viec, datViec] = useState<Viec[]>([]);
  const [canBo, datCanBo] = useState<CanBo | null>(null);
  const [dangTai, datDangTai] = useState(true);
  const [loi, datLoi] = useState<string | null>(null);
  const [bayGio, datBayGio] = useState(() => new Date());
  const [hoSoDangXem, datHoSoDangXem] = useState<{ id: string; ma: string } | null>(null);

  const taiLai = useCallback(async () => {
    // Văn thư (#78) không xử lý hồ sơ: không có hộp việc, không đọc bảng cán bộ.
    if (vaiTro === "van_thu") {
      datDangTai(false);
      return;
    }
    try {
      const tasks = await api.layTask();
      const hoSo = await api.layHoSo(tasks.flatMap((t) => (t.hoSoId ? [t.hoSoId] : [])));
      const luc = new Date();
      datBayGio(luc);
      datViec(ghepViec(tasks, hoSo, sub, luc));
      datLoi(null);
    } catch (e) {
      datLoi(e instanceof Error ? e.message : "Không tải được hộp việc.");
    } finally {
      datDangTai(false);
    }
  }, [api, sub, vaiTro]);

  useEffect(() => {
    void taiLai();
    if (vaiTro === "van_thu") return;
    api
      .layCanBo(sub)
      .then(datCanBo)
      .catch(() => datCanBo(null));
    const hen = window.setInterval(() => void taiLai(), CHU_KY_TAI_LAI_MS);
    return () => window.clearInterval(hen);
  }, [api, sub, taiLai, vaiTro]);

  const giaTri = useMemo(
    () => ({ api, nguoiDung, vaiTro, canBo, viec, dangTai, loi, bayGio, taiLai, hoSoDangXem, datHoSoDangXem }),
    [api, nguoiDung, vaiTro, canBo, viec, dangTai, loi, bayGio, taiLai, hoSoDangXem],
  );
  return <NguCanh.Provider value={giaTri}>{children}</NguCanh.Provider>;
}

export function useDuLieuCanBo() {
  const v = useContext(NguCanh);
  if (!v) throw new Error("useDuLieuCanBo phải nằm trong <DuLieuCanBoProvider>");
  return v;
}

/** Họ tên kiểu Việt: bảng can_bo; không có thì họ (family_name) trước tên (given_name) từ Keycloak. */
export function tenNguoiDung(nguoiDung: User, canBo: CanBo | null) {
  const p = nguoiDung.profile;
  const hoTen = [p.family_name, p.given_name].filter(Boolean).join(" ");
  return canBo?.ho_ten || hoTen || p.name || p.preferred_username || "Cán bộ";
}

/** "TM" từ "Trần Thị Một Cửa": chữ đầu của hai từ cuối. */
export function chuVietTat(ten: string) {
  const tu = ten.trim().split(/\s+/).filter(Boolean);
  return tu
    .slice(-2)
    .map((t) => t[0]?.toLocaleUpperCase("vi"))
    .join("");
}
