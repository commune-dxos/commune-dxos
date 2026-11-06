// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Khối mở đầu trang chủ (#141): nền slate-950 tràn viền có hoa văn chấm, tiêu đề rất đậm, ô tìm thủ tục bo tròn, lối
// tắt Tra cứu hồ sơ / Hỏi đáp dạng viên thuốc, số liệu thủ tục (khi danh mục đã tải) và ảnh minh họa của đội.
import { ArrowRight, MessageCircleQuestionMark, Search, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { HoaVanCham, NhanMuc } from "@/components/tieu-de-muc";

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

export function KhoiDau({
  tuKhoa,
  doiTuKhoa,
  soLieu,
}: {
  tuKhoa: string;
  doiTuKhoa: (tuKhoa: string) => void;
  soLieu: { tong: number; trucTuyen: number } | null;
}) {
  return (
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
                onChange={(e) => doiTuKhoa(e.target.value)}
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
          {soLieu && (
            <dl className="flex flex-wrap gap-x-10 gap-y-4 border-t border-white/10 pt-6">
              {[
                { so: soLieu.tong, nhan: "thủ tục cấp xã" },
                { so: soLieu.trucTuyen, nhan: "nộp được trực tuyến" },
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
  );
}
