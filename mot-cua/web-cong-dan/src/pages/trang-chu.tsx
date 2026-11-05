// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Trang chủ cổng công dân: phần đầu có ảnh minh họa của đội, ô tìm thủ tục lớn, lối tắt tra cứu và hỏi đáp; danh
// mục dạng lưới thẻ chia hai nhóm "nộp trực tuyến" và "chỉ nộp tại bộ phận một cửa"; các bước làm thủ tục (#141).
import { ArrowRight, Building2, Globe, MessageCircleQuestionMark, RotateCw, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router";
import { TheThuTuc } from "@/components/the-thu-tuc";
import { ThongBao } from "@/components/thong-bao";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
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

function LoiTat({ den, bieuTuong: BieuTuong, ten, moTa }: { den: string; bieuTuong: LucideIcon; ten: string; moTa: string }) {
  return (
    <Link
      to={den}
      className="group flex min-h-20 items-center gap-4 rounded-xl border bg-card p-4 text-foreground no-underline shadow-the transition-colors hover:border-primary hover:bg-primary-soft"
    >
      <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground [&_svg]:size-6">
        <BieuTuong />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-lg font-bold">{ten}</span>
        <span className="text-muted-foreground">{moTa}</span>
      </span>
      <ArrowRight aria-hidden="true" className="size-5 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" />
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
      <div className="flex flex-col gap-1">
        <h3 id={id} className="flex items-start gap-2 text-xl font-bold">
          <BieuTuong aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-primary" />
          <span>
            {tieuDe} <span className="font-normal text-muted-foreground">({ds.length})</span>
          </span>
        </h3>
        <p className="text-muted-foreground">{moTa}</p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
  const [tuKhoa, datTuKhoa] = useState("");
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
      <section aria-labelledby="gioi-thieu" className="border-b bg-gradient-to-b from-primary-soft to-background">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 md:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:gap-12">
          <div className="flex flex-col gap-7">
            <div className="flex flex-col gap-4">
              <p className="w-fit rounded-full bg-background px-3 py-1 font-semibold text-primary-soft-foreground shadow-the">
                Cổng dịch vụ công của xã
              </p>
              <h1 id="gioi-thieu" className="text-3xl font-bold sm:text-4xl lg:text-[3.25rem] lg:leading-[1.1]">
                Làm thủ tục hành chính của xã, không cần đi lại nhiều lần
              </h1>
              <p className="max-w-xl text-lg">
                Xem giấy tờ cần có, nộp hồ sơ trực tuyến và theo dõi kết quả tại một nơi.
              </p>
            </div>
            <div role="search" className="flex flex-col gap-2">
              <Label htmlFor="tim-thu-tuc" className="text-lg font-bold">
                Tìm thủ tục
              </Label>
              <InputGroup className="h-16 rounded-xl border-2 border-primary bg-background shadow-the">
                <InputGroupAddon className="pl-4 text-primary [&>svg]:size-6">
                  <Search aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupInput
                  id="tim-thu-tuc"
                  type="search"
                  value={tuKhoa}
                  onChange={(e) => {
                    datTuKhoa(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") document.getElementById("danh-muc")?.scrollIntoView?.({ block: "start" });
                  }}
                  placeholder="Ví dụ: khai sinh, kết hôn"
                  autoComplete="off"
                  className="h-full text-lg"
                />
              </InputGroup>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <LoiTat den="/tra-cuu" bieuTuong={Search} ten="Tra cứu hồ sơ" moTa="Bằng mã hồ sơ" />
              <LoiTat den="/hoi-dap" bieuTuong={MessageCircleQuestionMark} ten="Hỏi đáp thủ tục" moTa="Hỏi giấy tờ, lệ phí" />
            </div>
          </div>
          <img
            src="/minh-hoa-nop-ho-so.webp"
            alt=""
            width={1200}
            height={675}
            className="hidden h-auto w-full rounded-2xl border bg-background shadow-the md:block"
          />
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-14 px-4 pt-10 pb-16 sm:px-6 md:pt-12 md:pb-20">
        <section id="danh-muc" aria-labelledby="tieu-de-danh-muc" className="flex scroll-mt-4 flex-col gap-8">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 id="tieu-de-danh-muc" className="text-2xl font-bold sm:text-3xl">
              Danh mục thủ tục
            </h2>
            {trangThai.loai === "xong" && (
              <p className="text-muted-foreground" aria-live="polite">
                {loc.length === trangThai.danhSach.length
                  ? `${loc.length} thủ tục nhận hồ sơ`
                  : `Tìm thấy ${loc.length} / ${trangThai.danhSach.length} thủ tục`}
              </p>
            )}
          </div>

          {trangThai.loai === "dang-tai" && (
            <div role="status" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <span className="sr-only">Đang tải danh mục thủ tục…</span>
              {[0, 1, 2].map((i) => (
                <div key={i} aria-hidden="true" className="flex flex-col gap-4 rounded-xl border bg-card p-5">
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

        <section id="huong-dan" aria-labelledby="tieu-de-huong-dan" className="flex flex-col gap-6 rounded-2xl bg-surface p-6 sm:p-8">
          <h2 id="tieu-de-huong-dan" className="text-2xl font-bold">
            Làm thủ tục trực tuyến thế nào?
          </h2>
          <ol className="grid gap-6 md:grid-cols-3">
            {CAC_BUOC.map((b) => (
              <li key={b.so} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground"
                >
                  {b.so}
                </span>
                <span className="flex flex-col gap-1">
                  <strong className="text-lg">{b.ten}</strong>
                  <span>{b.moTa}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
