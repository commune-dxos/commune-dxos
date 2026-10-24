// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Dữ liệu dùng chung của cổng cán bộ: hộp việc (task + hồ sơ), thông tin người đăng nhập, đồng hồ để
// tính hạn, thông báo sắp trễ hạn (#56). Tải lại mỗi phút và sau mỗi lần xử lý bước; thanh bên, chuông
// thông báo và các trang cùng đọc một bản. Thông báo mới tới ngay qua luồng SSE /workflow/thong-bao/luong
// (consumer RabbitMQ của mot-cua-worker ghi CSDL → mot-cua-api đẩy); luồng đứt thì mở lại, chậm dần.
import type { User } from "oidc-client-ts";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiCanBo, type CanBo, type ThongBao } from "./lib/api";
import { ghepViec, type Viec } from "./lib/hop-viec";
import { LoiLuongKhongThuLai, moLuong } from "./lib/luong-thong-bao";
import type { VaiTroCanBo } from "./lib/quyen";

const CHU_KY_TAI_LAI_MS = 60_000;
/** Chờ trước khi mở lại luồng thông báo: 2 giây, gấp đôi mỗi lần lỗi, tối đa 1 phút. */
const CHO_MO_LAI_MS = 2_000;
const CHO_TOI_DA_MS = 60_000;

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
  /** Thông báo của mình, mới nhất trước (#56). */
  thongBao: ThongBao[];
  chuaDoc: number;
  danhDauDaDoc: (ids: string[]) => Promise<void>;
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
  const [thongBao, datThongBao] = useState<ThongBao[]>([]);
  const nhanThongBao = vaiTro === "can_bo" || vaiTro === "lanh_dao";

  const taiThongBao = useCallback(async () => {
    if (!nhanThongBao) return;
    try {
      datThongBao(await api.layThongBao());
    } catch {
      // bản lõi chưa có bảng thông báo hay mất mạng: giữ danh sách cũ, chuông vẫn hiện hạn xử lý
    }
  }, [api, nhanThongBao]);

  const danhDauDaDoc = useCallback(
    async (ids: string[]) => {
      const luc = new Date().toISOString();
      datThongBao((ds) => ds.map((t) => (ids.includes(t.id) && !t.da_doc_luc ? { ...t, da_doc_luc: luc } : t)));
      try {
        await api.danhDauDaDoc(ids);
      } finally {
        await taiThongBao();
      }
    },
    [api, taiThongBao],
  );

  // Luồng SSE: mỗi lần số chưa đọc hay thông báo mới nhất đổi thì tải lại danh sách.
  useEffect(() => {
    if (!nhanThongBao) return;
    const huy = new AbortController();
    let cho = CHO_MO_LAI_MS;
    let hen: number | undefined;
    const mo = () => {
      moLuong(api.cauHinh, api.token, () => void taiThongBao(), huy.signal, api.goi)
        .then(() => {
          cho = CHO_MO_LAI_MS;
        })
        .catch((e: unknown) => {
          if (e instanceof LoiLuongKhongThuLai) cho = 0;
          else cho = Math.min(cho * 2, CHO_TOI_DA_MS);
        })
        .finally(() => {
          if (!huy.signal.aborted && cho > 0) hen = window.setTimeout(mo, cho);
        });
    };
    mo();
    return () => {
      huy.abort();
      window.clearTimeout(hen);
    };
  }, [api, nhanThongBao, taiThongBao]);

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
    void taiThongBao();
    if (vaiTro === "van_thu") return;
    api
      .layCanBo(sub)
      .then(datCanBo)
      .catch(() => datCanBo(null));
    const hen = window.setInterval(() => {
      void taiLai();
      void taiThongBao();
    }, CHU_KY_TAI_LAI_MS);
    return () => window.clearInterval(hen);
  }, [api, sub, taiLai, taiThongBao, vaiTro]);

  const chuaDoc = useMemo(() => thongBao.filter((t) => !t.da_doc_luc).length, [thongBao]);
  const giaTri = useMemo(
    () => ({
      api, nguoiDung, vaiTro, canBo, viec, dangTai, loi, bayGio, taiLai, hoSoDangXem, datHoSoDangXem,
      thongBao, chuaDoc, danhDauDaDoc,
    }),
    [api, nguoiDung, vaiTro, canBo, viec, dangTai, loi, bayGio, taiLai, hoSoDangXem, thongBao, chuaDoc, danhDauDaDoc],
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
