// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Các màn trước khi vào cổng cán bộ: chưa đăng nhập (bố cục 2 cột Bàn làm việc Điều hành Cấp xã),
// hoàn tất đăng nhập (đổi code lấy token, PKCE), không có quyền (đăng nhập được nhưng không có vai
// can_bo/lanh_dao), không thấy trang.
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  FileCheck2,
  FileSignature,
  KeyRound,
  LogIn,
  LogOut,
  ShieldCheck,
  ShieldX,
  Stamp,
  UserCheck,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { GOC_CAN_BO } from "@/auth/oidc";
import { KHOA_NGUOI_DUNG_DEMO, useXacThuc } from "@/auth/xac-thuc";
import { ThongBao } from "@/components/thong-bao";
import { cauHinh } from "@/lib/cau-hinh";
import { HoaVanCham } from "@/components/tieu-de-muc";
import { Button, buttonVariants } from "@/components/ui/button";

function NenGiua({ children }: { children: ReactNode }) {
  return (
    <main
      id="noi-dung"
      className="relative isolate flex min-h-dvh flex-col justify-between overflow-x-hidden bg-gradient-to-b from-teal-50/40 via-slate-50/60 to-white text-slate-900"
    >
      <HoaVanCham />
      <header className="relative z-10 border-b border-slate-200/90 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:gap-3 sm:px-6">
          <a href="/" className="group flex min-w-0 items-center gap-2.5 text-slate-950 no-underline sm:gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-teal-600/20 bg-teal-50/70 p-1 shadow-2xs transition-transform group-hover:scale-105 sm:size-10">
              <img src="/mark-64.png" alt="" width={32} height={32} className="size-7 sm:size-8" />
            </span>
            <span className="flex min-w-0 flex-col leading-none">
              <span className="text-sm font-black tracking-tight whitespace-nowrap text-slate-950 sm:text-base">
                COMMUNE DX-OS
              </span>
              <span className="mt-1 hidden text-xs font-bold tracking-[0.12em] text-primary uppercase sm:block">
                Hệ điều hành Chính quyền số Cấp xã
              </span>
            </span>
          </a>
          <a
            href="/"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 no-underline shadow-2xs transition-colors hover:border-primary/40 hover:bg-teal-50/40 hover:text-primary sm:px-3 sm:py-2 sm:text-sm"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            <span className="hidden sm:inline">Cổng dịch vụ công công dân</span>
            <span className="sm:hidden">Trang chủ</span>
          </a>
        </div>
      </header>

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-4 py-8 sm:px-6 md:py-12">
        {children}
      </div>

      <footer className="relative z-10 border-t border-slate-200/80 bg-white px-4 py-3 text-xs text-slate-500 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
          <span>© 2026 DTU_DZ_2 · Commune DX-OS · Hệ thống điều hành tác nghiệp cấp xã</span>
          <span className="font-mono text-slate-500">OIDC PKCE · PostgreSQL RLS · PAdES CA</span>
        </div>
      </footer>
    </main>
  );
}

const b64 = (s: string) =>
  btoa(encodeURIComponent(s).replace(/%([0-9A-F]{2})/g, (_, p) => String.fromCharCode(parseInt(p, 16))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const jwtGia = (payload: object) => `${b64('{"alg":"RS256"}')}.${b64(JSON.stringify(payload))}.sig`;

function vaoDemo(vaiTro: "can_bo" | "lanh_dao" | "van_thu", ten: string) {
  const u = {
    profile: {
      sub: "00000000-0000-0000-0000-00000000b001",
      preferred_username: vaiTro,
      name: ten,
    },
    access_token: jwtGia({
      sub: "00000000-0000-0000-0000-00000000b001",
      resource_access: { dxos_api: { roles: [vaiTro] } },
    }),
    expired: false,
  };
  sessionStorage.setItem(KHOA_NGUOI_DUNG_DEMO, JSON.stringify(u));
  window.location.reload();
}

const VAI_TRO_DEMO = [
  {
    ma: "can_bo" as const,
    nhanNut: "Vào vai: Cán bộ Một cửa",
    hoTen: "Trần Thị Một Cửa",
    chucVu: "Công chức Tư pháp – Hộ tịch",
    quyen: "Tiếp nhận & Thẩm định",
    bieuTuong: UserCheck,
    mauIcon: "border-teal-600/20 bg-teal-50 text-primary",
    mauNhan: "border-teal-700/20 bg-teal-50 text-teal-900",
  },
  {
    ma: "lanh_dao" as const,
    nhanNut: "Vào vai: Lãnh đạo UBND xã",
    hoTen: "Nguyễn Văn Lãnh Đạo",
    chucVu: "Chủ tịch UBND xã",
    quyen: "Phê duyệt & Ký số CA",
    bieuTuong: FileSignature,
    mauIcon: "border-indigo-600/20 bg-indigo-50 text-indigo-700",
    mauNhan: "border-indigo-700/20 bg-indigo-50 text-indigo-900",
  },
  {
    ma: "van_thu" as const,
    nhanNut: "Vào vai: Văn thư xã",
    hoTen: "Lê Thị Văn Thư",
    chucVu: "Cán bộ Văn thư – Lưu trữ",
    quyen: "Sổ văn bản & Lịch tuần",
    bieuTuong: Stamp,
    mauIcon: "border-amber-600/20 bg-amber-50 text-amber-800",
    mauNhan: "border-amber-700/20 bg-amber-50 text-amber-900",
  },
];

export function ChuaDangNhap() {
  const { dangNhap } = useXacThuc();
  const laDuLieuGia = cauHinh.duLieuGia;
  return (
    <NenGiua>
      <div className="grid w-full overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-the lg:grid-cols-12">
        {/* Cột trái (7 cột): Khung xác thực SSO & Chọn nhanh vai trò công vụ */}
        <section className="flex min-w-0 flex-col justify-between gap-6 bg-white p-6 sm:p-10 lg:col-span-7">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2 border-l-4 border-primary pl-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Cổng cán bộ</h1>
                <span className="rounded-md border border-teal-700/20 bg-teal-50 px-2.5 py-0.5 text-xs font-bold text-teal-900">
                  Mạng nội bộ UBND xã
                </span>
              </div>
              <p className="text-base text-slate-600">
                Dành cho cán bộ một cửa, cán bộ chuyên môn và lãnh đạo xã: xử lý hồ sơ theo lĩnh vực phụ trách.
              </p>
            </div>

            <div className="flex flex-col gap-3.5 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold tracking-wider text-slate-700 uppercase">
                  Đăng nhập một lần (Keycloak SSO)
                </span>
                <span className="rounded-md border border-teal-700/20 bg-white px-2.5 py-0.5 text-xs font-bold text-primary shadow-2xs">
                  Mật khẩu + mã OTP
                </span>
              </div>
              <Button
                size="lg"
                className="h-12 w-full justify-between text-base font-bold shadow-xs"
                onClick={() => void dangNhap()}
              >
                <span className="flex items-center gap-2.5">
                  <LogIn aria-hidden="true" />
                  Đăng nhập
                </span>
                <ArrowRight aria-hidden="true" className="size-4.5" />
              </Button>
              <div className="flex items-start gap-2.5 pt-0.5 text-sm leading-relaxed text-slate-600">
                <KeyRound aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-primary" />
                <span>
                  Đăng nhập bằng tài khoản cán bộ qua hệ thống đăng nhập một lần của xã. Cần mật khẩu và mã OTP trên ứng dụng xác thực (lần đầu sẽ được hướng dẫn cài).
                </span>
              </div>
            </div>

            {laDuLieuGia && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/90 pb-2">
                  <span className="text-xs font-bold tracking-wider text-slate-700 uppercase">
                    Chế độ thử nghiệm dữ liệu mẫu · Chọn vai trò công vụ
                  </span>
                  <span className="text-xs font-semibold text-primary">Vào thẳng bàn làm việc</span>
                </div>
                <div className="grid gap-2.5">
                  {VAI_TRO_DEMO.map((vt) => {
                    const Icon = vt.bieuTuong;
                    return (
                      <button
                        key={vt.ma}
                        type="button"
                        onClick={() => vaoDemo(vt.ma, vt.hoTen)}
                        className="group flex w-full min-w-0 cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200/90 bg-white px-4 py-3 text-left shadow-2xs transition-all hover:border-primary/50 hover:bg-teal-50/30 hover:shadow-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring"
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-3.5">
                          <span
                            aria-hidden="true"
                            className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${vt.mauIcon}`}
                          >
                            <Icon className="size-5" />
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-base font-bold text-slate-950 group-hover:text-primary">
                                {vt.nhanNut}
                              </span>
                              <span className={`hidden rounded-sm border px-2 py-0.5 text-xs font-semibold sm:inline-block ${vt.mauNhan}`}>
                                {vt.quyen}
                              </span>
                            </span>
                            <span className="text-xs text-slate-600">
                              {vt.hoTen} · {vt.chucVu}
                            </span>
                          </span>
                        </span>
                        <ArrowRight
                          aria-hidden="true"
                          className="size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-200/80 pt-4">
            <a href="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-link hover:underline">
              <span>← Bạn là người dân? Tới cổng dịch vụ công trực tuyến</span>
            </a>
          </div>
        </section>

        {/* Cột phải (5 cột): Bảng tiêu chuẩn vận hành & phân quyền công vụ nền sáng */}
        <aside
          aria-label="Thông số vận hành cổng cán bộ"
          className="flex min-w-0 flex-col justify-between gap-6 border-t border-slate-200/90 bg-gradient-to-b from-teal-50/60 via-slate-50/80 to-slate-100/60 p-6 sm:p-10 lg:col-span-5 lg:border-t-0 lg:border-l"
        >
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold tracking-wider text-primary uppercase">
                Kiến trúc Tác nghiệp Một cửa
              </span>
              <h2 className="text-xl leading-snug font-black tracking-tight text-slate-950 sm:text-2xl">
                Điều hành hồ sơ, văn bản và lịch công tác chuẩn số hóa cấp xã
              </h2>
              <p className="text-sm leading-relaxed text-slate-600">
                Mọi thao tác tiếp nhận, thẩm định, ký duyệt đều được ghi vết kiểm toán và đồng bộ trực tiếp với Cổng dịch vụ công công dân.
              </p>
            </div>

            <ul className="flex flex-col gap-3">
              <li className="flex items-start gap-3 rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-teal-600/20 bg-teal-50 text-primary">
                  <FileCheck2 aria-hidden="true" className="size-4.5" />
                </span>
                <div className="flex flex-col gap-0.5 text-sm">
                  <strong className="font-bold text-slate-900">Hộp việc Flowable BPMN & SLA</strong>
                  <span className="text-xs leading-relaxed text-slate-600">
                    Tự động phân luồng theo lĩnh vực (Hộ tịch, Chứng thực, Đất đai) kèm cảnh báo hồ sơ sắp trễ hạn.
                  </span>
                </div>
              </li>
              <li className="flex items-start gap-3 rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-indigo-600/20 bg-indigo-50 text-indigo-700">
                  <FileSignature aria-hidden="true" className="size-4.5" />
                </span>
                <div className="flex flex-col gap-0.5 text-sm">
                  <strong className="font-bold text-slate-900">Chữ ký số CA xã & Sổ văn bản</strong>
                  <span className="text-xs leading-relaxed text-slate-600">
                    Cấp số tự động, ký ban hành PDF (PAdES) cho biên nhận, kết quả giải quyết và công văn đi/đến.
                  </span>
                </div>
              </li>
              <li className="flex items-start gap-3 rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-amber-600/20 bg-amber-50 text-amber-800">
                  <ShieldCheck aria-hidden="true" className="size-4.5" />
                </span>
                <div className="flex flex-col gap-0.5 text-sm">
                  <strong className="font-bold text-slate-900">Phân quyền dữ liệu PostgreSQL RLS</strong>
                  <span className="text-xs leading-relaxed text-slate-600">
                    Kiểm soát truy cập mức dòng dữ liệu theo đúng vai trò Cán bộ Một cửa, Văn thư và Lãnh đạo UBND.
                  </span>
                </div>
              </li>
            </ul>
          </div>

          <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-xs text-slate-600 shadow-2xs">
            <span className="flex items-center gap-2 font-semibold text-slate-800">
              <Building2 aria-hidden="true" className="size-4 text-primary" />
              UBND cấp xã · Bộ phận Một cửa
            </span>
            <span className="font-mono font-bold text-primary">v0.12.2</span>
          </div>
        </aside>
      </div>
    </NenGiua>
  );
}

export function KhongCoQuyen() {
  const { nguoiDung, dangXuat } = useXacThuc();
  useEffect(() => {
    document.title = "Không có quyền – Cổng cán bộ – Commune DX-OS";
  }, []);
  return (
    <NenGiua>
      <ThongBao
        role="alert"
        loai="loi"
        capTieuDe="h1"
        bieuTuong={ShieldX}
        tieuDe="Bạn không có quyền vào cổng cán bộ"
        className="max-w-xl"
        hanhDong={
          <>
            <Button onClick={() => void dangXuat()}>
              <LogOut aria-hidden="true" />
              Đăng xuất, dùng tài khoản khác
            </Button>
            <a href="/" className={buttonVariants({ variant: "outline" })}>
              Tới cổng dịch vụ công
            </a>
          </>
        }
      >
        Tài khoản {nguoiDung?.profile.preferred_username ? <strong>{nguoiDung.profile.preferred_username}</strong> : "này"} không
        có vai trò cán bộ hoặc lãnh đạo xã. Nếu bạn là cán bộ, đề nghị quản trị viên cấp quyền.
      </ThongBao>
    </NenGiua>
  );
}

export function DangNhapXongCanBo() {
  const { hoanTatDangNhap, dangNhap } = useXacThuc();
  const dieuHuong = useNavigate();
  const [loi, datLoi] = useState(false);
  const daGoi = useRef(false);

  useEffect(() => {
    if (daGoi.current) return;
    daGoi.current = true;
    hoanTatDangNhap()
      .then((quayVe) => dieuHuong(quayVe.startsWith(GOC_CAN_BO) ? quayVe : GOC_CAN_BO, { replace: true }))
      .catch(() => datLoi(true));
  }, [hoanTatDangNhap, dieuHuong]);

  return (
    <NenGiua>
      {loi ? (
        <ThongBao
          role="alert"
          loai="loi"
          capTieuDe="h1"
          tieuDe="Chưa đăng nhập được"
          className="max-w-xl"
          hanhDong={
            <Button onClick={() => void dangNhap(GOC_CAN_BO)}>
              <LogIn aria-hidden="true" />
              Đăng nhập lại
            </Button>
          }
        >
          Phiên đăng nhập không thành công hoặc đã hết hạn, thường do để trang đăng nhập quá lâu hoặc bấm quay lại.
        </ThongBao>
      ) : (
        <p role="status" className="text-lg">
          Đang hoàn tất đăng nhập…
        </p>
      )}
    </NenGiua>
  );
}

export function KhongThayTrang() {
  return (
    <ThongBao
      loai="trong"
      capTieuDe="h1"
      tieuDe="Không tìm thấy trang"
      hanhDong={
        <Link to={GOC_CAN_BO} className={buttonVariants({ variant: "outline" })}>
          Về hộp việc
        </Link>
      }
    >
      Đường dẫn không đúng hoặc trang đã được chuyển.
    </ThongBao>
  );
}
