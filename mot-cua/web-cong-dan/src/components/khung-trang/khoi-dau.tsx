// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Khối mở đầu trang chủ (#141): Bàn làm việc Dịch vụ công cấp xã sáng sủa, tiêu đề cân đối,
// thanh tìm kiếm trung tâm kèm từ khóa gợi ý nhanh, bảng cam kết dịch vụ số và lối tắt trực quan.
import { ArrowRight, CheckCircle2, FileCheck2, MessageCircleQuestionMark, Search, ShieldCheck, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { HoaVanCham } from "@/components/tieu-de-muc";

const TU_KHOA_NHANH = ["Khai sinh", "Chứng thực", "Kết hôn", "Tình trạng hôn nhân"];

function LoiTat({ den, bieuTuong: BieuTuong, ten, moTa }: { den: string; bieuTuong: LucideIcon; ten: string; moTa: string }) {
  return (
    <Link
      to={den}
      className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-white p-3.5 text-slate-900 no-underline shadow-2xs transition-all hover:border-primary/50 hover:bg-teal-50/40"
    >
      <span className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-teal-600/20 bg-teal-50 text-primary">
          <BieuTuong aria-hidden="true" className="size-5" />
        </span>
        <span className="flex flex-col leading-snug">
          <span className="font-bold text-slate-900 group-hover:text-primary">{ten}</span>
          <span className="text-sm text-slate-600">{moTa}</span>
        </span>
      </span>
      <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
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
    <section
      aria-labelledby="gioi-thieu"
      className="relative isolate overflow-hidden border-b border-slate-200/90 bg-gradient-to-b from-teal-50/55 via-slate-50/40 to-white text-foreground"
    >
      <HoaVanCham />
      <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 md:py-14">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_25rem] lg:gap-12">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3 border-l-4 border-primary pl-4">
              <h1 id="gioi-thieu" className="text-3xl leading-[1.12] font-black tracking-tight text-slate-950 sm:text-4xl lg:text-5xl">
                Làm thủ tục hành chính xã, <span className="text-primary">không cần đi lại nhiều lần</span>
              </h1>
              <p className="max-w-2xl text-lg text-slate-600">
                Tra cứu giấy tờ cần chuẩn bị, nộp hồ sơ trực tuyến nhận biên nhận ký số của Ủy ban nhân dân xã và theo dõi tiến độ xử lý minh bạch.
              </p>
            </div>

            <div role="search" className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-the sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="tim-thu-tuc" className="text-base font-bold text-slate-900">
                  Tìm thủ tục
                </label>
                {soLieu && (
                  <span className="text-sm font-medium text-slate-600">
                    Đang cung cấp <strong className="text-slate-900">{soLieu.tong}</strong> thủ tục ({soLieu.trucTuyen} trực tuyến)
                  </span>
                )}
              </div>
              <div className="relative flex items-center">
                <Search aria-hidden="true" className="pointer-events-none absolute left-4 size-5 text-primary" />
                <input
                  id="tim-thu-tuc"
                  type="search"
                  value={tuKhoa}
                  onChange={(e) => doiTuKhoa(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") document.getElementById("danh-muc")?.scrollIntoView?.({ block: "start" });
                  }}
                  placeholder="Nhập tên hoặc mã thủ tục (ví dụ: khai sinh, chứng thực, KS01)…"
                  autoComplete="off"
                  className="h-13 w-full rounded-xl border border-slate-300 bg-slate-50/70 pr-4 pl-12 text-lg text-foreground outline-none transition-colors placeholder:text-slate-500 focus-visible:border-primary focus-visible:bg-white focus-visible:ring-[3px] focus-visible:ring-primary/20"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <span className="text-sm font-medium text-slate-500">Tra nhanh:</span>
                {TU_KHOA_NHANH.map((tk) => (
                  <button
                    key={tk}
                    type="button"
                    onClick={() => {
                      doiTuKhoa(tk);
                      document.getElementById("danh-muc")?.scrollIntoView?.({ block: "start" });
                    }}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm font-semibold text-slate-700 transition-colors hover:border-primary/40 hover:bg-teal-50 hover:text-primary"
                  >
                    {tk}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <LoiTat
                den="/tra-cuu"
                bieuTuong={Search}
                ten="Tra cứu tiến độ hồ sơ"
                moTa="Nhập mã biên nhận & 4 số cuối điện thoại"
              />
              <LoiTat
                den="/hoi-dap"
                bieuTuong={MessageCircleQuestionMark}
                ten="Hỏi đáp thủ tục AI"
                moTa="Giải đáp thành phần hồ sơ, lệ phí có dẫn nguồn"
              />
            </div>
          </div>

          <aside aria-label="Thông tin cổng dịch vụ công" className="flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-the">
            <div className="overflow-hidden rounded-xl border border-slate-200/70 bg-slate-50">
              <img
                src="/minh-hoa-nop-ho-so.webp"
                alt="Minh họa quy trình nộp hồ sơ một cửa"
                width={1200}
                height={675}
                className="h-auto w-full object-cover"
              />
            </div>
            <div className="flex flex-col gap-2.5 px-1">
              <div className="flex items-start gap-2.5 text-sm text-slate-700">
                <ShieldCheck aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-primary" />
                <span>
                  <strong className="text-slate-900">Biên nhận & kết quả ký số:</strong> Cấp tự động bằng chứng thư số của UBND xã.
                </span>
              </div>
              <div className="flex items-start gap-2.5 text-sm text-slate-700">
                <FileCheck2 aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-primary" />
                <span>
                  <strong className="text-slate-900">Kiểm tra hồ sơ trước khi gửi:</strong> Hỗ trợ đọc giấy tờ tự động và cảnh báo nếu thiếu tệp bắt buộc.
                </span>
              </div>
              <div className="flex items-start gap-2.5 text-sm text-slate-700">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-primary" />
                <span>
                  <strong className="text-slate-900">Theo dõi đúng hạn 24/7:</strong> Hiển thị rõ từng bước tiếp nhận, thẩm định và phê duyệt.
                </span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
