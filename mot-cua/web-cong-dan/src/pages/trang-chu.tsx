// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Trang chủ cổng công dân: phần đầu có ảnh minh họa của đội, ô tìm thủ tục lớn, lối tắt tra cứu và hỏi đáp; danh
// mục dạng lưới thẻ chia hai nhóm "nộp trực tuyến" và "chỉ nộp tại bộ phận một cửa"; các bước làm thủ tục (#141).
import { ArrowRight, Building2, CircleCheck, Globe, MessageCircleQuestionMark, RotateCw, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { TheThuTuc } from "@/components/the-thu-tuc";
import { HoaVanCham, NhanMuc, TieuDeMuc } from "@/components/tieu-de-muc";
import { ThongBao } from "@/components/thong-bao";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { layDanhMucThuTuc, LoiApi, type ThuTuc } from "@/lib/api";
import { chuanHoa } from "@/lib/dinh-dang";
import { useTieuDeTrang } from "@/lib/tieu-de";

type TrangThai =
  | { loai: "dang-tai" }
  | { loai: "loi"; thongDiep: string }
  | { loai: "xong"; danhSach: ThuTuc[] };

const CAC_BUOC: { so: number; ten: string; moTa: string }[] = [
  { so: 1, ten: "Chọn thủ tục", moTa: "Xem thời hạn, lệ phí và giấy tờ cần có." },
  { so: 2, ten: "Nộp hồ sơ trực tuyến", moTa: "Điền thông tin, tải ảnh hoặc bản quét giấy tờ." },
  { so: 3, ten: "Theo dõi tiến độ", moTa: "Tra cứu bằng mã hồ sơ, biết khi nào có kết quả." },
];

function LoiTat({ den, bieuTuong: BieuTuong, ten }: { den: string; bieuTuong: LucideIcon; ten: string }) {
  return (
    <Link
      to={den}
      className="group inline-flex min-h-12 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-5 font-bold text-white no-underline backdrop-blur transition-colors hover:bg-white/20"
    >
      <BieuTuong aria-hidden="true" className="size-5 text-teal-300" />
      {ten}
      <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function NhomThuTuc({
  id,
  bieuTuong: BieuTuong,
  tieuDe,
  moTa,
  ds,
}: {
  id: string;
  bieuTuong: LucideIcon;
  tieuDe: string;
  moTa: string;
  ds: ThuTuc[];
}) {
  if (!ds.length) return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-teal-300 shadow-lg shadow-slate-900/10">
          <BieuTuong className="size-6" />
        </span>
        <div className="flex flex-col gap-0.5">
          <h3 id={id} className="text-2xl font-black tracking-tight">
            {tieuDe} <span className="font-bold text-muted-foreground">({ds.length})</span>
          </h3>
          <p className="text-muted-foreground">{moTa}</p>
        </div>
      </div>
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {ds.map((t) => (
          <li key={t.id} className="flex">
            <TheThuTuc thuTuc={t} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TrangChu({ taiDanhMuc = layDanhMucThuTuc }: { taiDanhMuc?: () => Promise<ThuTuc[]> }) {
  const [trangThai, datTrangThai] = useState<TrangThai>({ loai: "dang-tai" });
  const [tham] = useSearchParams();
  const [tuKhoa, datTuKhoa] = useState(tham.get("tim") ?? "");
  useTieuDeTrang("Danh mục thủ tục");

  const tai = useCallback(() => {
    datTrangThai({ loai: "dang-tai" });
    taiDanhMuc()
      .then((danhSach) => datTrangThai({ loai: "xong", danhSach }))
      .catch((e: unknown) =>
        datTrangThai({
          loai: "loi",
          thongDiep: e instanceof LoiApi ? e.message : "Không tải được danh mục thủ tục. Vui lòng thử lại.",
        }),
      );
  }, [taiDanhMuc]);

  useEffect(tai, [tai]);

  // Liên kết "/#danh-muc" (từ hỏi đáp, chân trang): cuộn tới danh mục khi đã tải xong.
  const { hash } = useLocation();
  const daTai = trangThai.loai !== "dang-tai";
  useEffect(() => {
    if (daTai && hash) document.getElementById(hash.slice(1))?.scrollIntoView?.({ block: "start" });
  }, [hash, daTai]);

  const loc = useMemo(() => {
    if (trangThai.loai !== "xong") return [];
    const k = chuanHoa(tuKhoa);
    if (!k) return trangThai.danhSach;
    return trangThai.danhSach.filter((t) =>
      chuanHoa(`${t.ma} ${t.ten} ${t.linh_vuc?.ten ?? ""}`).includes(k),
    );
  }, [trangThai, tuKhoa]);

  const trucTuyen = loc.filter((t) => t.quy_trinh);
  const taiMotCua = loc.filter((t) => !t.quy_trinh);

  return (
    <>
      <section aria-labelledby="gioi-thieu" className="nen-toi relative isolate overflow-hidden bg-slate-950 text-white">
        <HoaVanCham />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 md:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-5">
              <NhanMuc toi>Cổng dịch vụ công của xã</NhanMuc>
              <h1 id="gioi-thieu" className="text-4xl leading-[1.02] font-black tracking-tighter sm:text-6xl lg:text-7xl">
                Làm thủ tục xã, <span className="text-teal-300">không cần đi lại nhiều lần</span>
              </h1>
              <p className="max-w-xl text-lg text-slate-300 sm:text-xl">
                Xem giấy tờ cần có, nộp hồ sơ trực tuyến và theo dõi kết quả tại một nơi.
              </p>
            </div>
            <div role="search" className="flex max-w-xl flex-col gap-3">
              <label htmlFor="tim-thu-tuc" className="text-sm font-bold tracking-[0.2em] text-slate-200 uppercase">
                Tìm thủ tục
              </label>
              <div className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-5 size-6 -translate-y-1/2 text-primary" />
                <input
                  id="tim-thu-tuc"
                  type="search"
                  value={tuKhoa}
                  onChange={(e) => datTuKhoa(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") document.getElementById("danh-muc")?.scrollIntoView?.({ block: "start" });
                  }}
                  placeholder="Ví dụ: khai sinh, kết hôn"
                  autoComplete="off"
                  className="h-16 w-full rounded-full border-0 bg-white pr-6 pl-14 text-lg text-foreground shadow-2xl shadow-black/30 outline-none placeholder:text-slate-500 focus-visible:ring-4 focus-visible:ring-teal-300"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <LoiTat den="/tra-cuu" bieuTuong={Search} ten="Tra cứu hồ sơ" />
              <LoiTat den="/hoi-dap" bieuTuong={MessageCircleQuestionMark} ten="Hỏi đáp thủ tục" />
            </div>
            {trangThai.loai === "xong" && (
              <dl className="flex flex-wrap gap-x-10 gap-y-4 border-t border-white/10 pt-6">
                {[
                  { so: trangThai.danhSach.length, nhan: "thủ tục cấp xã" },
                  { so: trangThai.danhSach.filter((t) => t.quy_trinh).length, nhan: "nộp được trực tuyến" },
                ].map((d) => (
                  <div key={d.nhan} className="flex flex-col">
                    <dt className="order-2 text-slate-300">{d.nhan}</dt>
                    <dd className="order-1 text-4xl font-black tracking-tight text-white tabular-nums">{d.so}</dd>
                  </div>
                ))}
                <div className="flex flex-col">
                  <dt className="order-2 text-slate-300">tra cứu tiến độ</dt>
                  <dd className="order-1 text-4xl font-black tracking-tight text-white">24/7</dd>
                </div>
              </dl>
            )}
          </div>
          <div className="relative hidden md:block">
            <div aria-hidden="true" className="absolute -inset-4 rotate-2 rounded-[2.5rem] bg-primary/30" />
            <img
              src="/minh-hoa-nop-ho-so.webp"
              alt=""
              width={1200}
              height={675}
              className="relative h-auto w-full rounded-[2rem] border border-white/10 bg-white shadow-2xl shadow-black/40"
            />
          </div>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-4 pt-14 pb-16 sm:px-6 md:pt-20 md:pb-24">
        <section id="danh-muc" aria-labelledby="tieu-de-danh-muc" className="flex scroll-mt-24 flex-col gap-10">
          <TieuDeMuc
            id="tieu-de-danh-muc"
            nhan="Danh mục thủ tục"
            hanhDong={
              trangThai.loai === "xong" && (
                <p className="w-fit rounded-full border border-slate-200 bg-white px-4 py-2 font-bold text-slate-700" aria-live="polite">
                  {loc.length === trangThai.danhSach.length
                    ? `${loc.length} thủ tục nhận hồ sơ`
                    : `Tìm thấy ${loc.length} / ${trangThai.danhSach.length} thủ tục`}
                </p>
              )
            }
          >
            Chọn thủ tục cần làm
          </TieuDeMuc>

          {trangThai.loai === "dang-tai" && (
            <div role="status" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <span className="sr-only">Đang tải danh mục thủ tục…</span>
              {[0, 1, 2].map((i) => (
                <div key={i} aria-hidden="true" className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-card p-6">
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-8 w-3/4" />
                  <Skeleton className="h-6 w-1/2" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ))}
            </div>
          )}

          {trangThai.loai === "loi" && (
            <ThongBao
              role="alert"
              loai="loi"
              tieuDe="Chưa tải được danh mục thủ tục"
              hanhDong={
                <Button onClick={tai}>
                  <RotateCw aria-hidden="true" />
                  Thử lại
                </Button>
              }
            >
              {trangThai.thongDiep}
            </ThongBao>
          )}

          {trangThai.loai === "xong" &&
            (loc.length === 0 ? (
              <ThongBao
                loai="trong"
                tieuDe={`Không có thủ tục nào khớp “${tuKhoa}”`}
                hanhDong={
                  <Button variant="outline" onClick={() => datTuKhoa("")}>
                    Xóa từ khóa, xem tất cả
                  </Button>
                }
              >
                Thử từ ngắn hơn, ví dụ “khai sinh” hoặc “chứng thực”. Thủ tục chưa có ở đây vẫn nộp được tại bộ phận
                một cửa của xã.
              </ThongBao>
            ) : (
              <>
                <NhomThuTuc
                  id="nhom-truc-tuyen"
                  bieuTuong={Globe}
                  tieuDe="Nộp trực tuyến"
                  moTa="Nộp hồ sơ ngay trên cổng, theo dõi tiến độ bằng mã hồ sơ."
                  ds={trucTuyen}
                />
                <NhomThuTuc
                  id="nhom-mot-cua"
                  bieuTuong={Building2}
                  tieuDe="Chỉ nộp tại bộ phận một cửa"
                  moTa="Xem trước giấy tờ cần mang, rồi nộp trực tiếp tại Ủy ban nhân dân xã."
                  ds={taiMotCua}
                />
              </>
            ))}
        </section>

        <section
          id="huong-dan"
          aria-labelledby="tieu-de-huong-dan"
          className="flex flex-col gap-10 rounded-[2rem] border border-slate-100 bg-slate-50 p-6 sm:p-10 md:rounded-[3rem] md:p-14"
        >
          <TieuDeMuc id="tieu-de-huong-dan" nhan="Quy trình">
            3 bước làm thủ tục trực tuyến
          </TieuDeMuc>
          <ol className="grid gap-5 md:grid-cols-3">
            {CAC_BUOC.map((b) => (
              <li key={b.so} className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-slate-100 bg-white p-6 shadow-the">
                <span aria-hidden="true" className="absolute top-2 right-4 text-7xl leading-none font-black text-slate-100 select-none">
                  {b.so}
                </span>
                <span aria-hidden="true" className="relative flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                  <CircleCheck className="size-6" />
                </span>
                <strong className="relative text-xl font-black tracking-tight">
                  <span className="sr-only">Bước {b.so}: </span>
                  {b.ten}
                </strong>
                <span className="relative text-slate-700">{b.moTa}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
