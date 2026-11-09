// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Trang chủ cổng công dân (#141): khối mở đầu (components/khung-trang/khoi-dau.tsx), danh mục dạng lưới thẻ chia hai
// nhóm "nộp trực tuyến" và "chỉ nộp tại bộ phận một cửa" (thẻ: components/the-thu-tuc.tsx), các bước làm thủ tục.
import { Building2, Globe, RotateCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router";
import { KhoiDau } from "@/components/khung-trang/khoi-dau";
import { TheThuTuc } from "@/components/the-thu-tuc";
import { TieuDeMuc } from "@/components/tieu-de-muc";
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
    <section aria-labelledby={id} className="flex flex-col gap-5">
      <div className="flex items-start gap-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
        <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-teal-600/20 bg-white text-primary shadow-2xs">
          <BieuTuong className="size-5" />
        </span>
        <div className="flex flex-col gap-0.5">
          <h3 id={id} className="text-xl font-black tracking-tight text-slate-950">
            {tieuDe} <span className="font-bold text-slate-500">({ds.length})</span>
          </h3>
          <p className="text-sm text-slate-600">{moTa}</p>
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
      <KhoiDau
        tuKhoa={tuKhoa}
        doiTuKhoa={datTuKhoa}
        soLieu={
          trangThai.loai === "xong"
            ? { tong: trangThai.danhSach.length, trucTuyen: trangThai.danhSach.filter((t) => t.quy_trinh).length }
            : null
        }
      />

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
          className="flex flex-col gap-6"
        >
          <TieuDeMuc id="tieu-de-huong-dan" nhan="Hướng dẫn thực hiện">
            Quy trình nộp và nhận kết quả trực tuyến
          </TieuDeMuc>
          <ol className="grid divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-the md:grid-cols-3 md:divide-x md:divide-y-0">
            {CAC_BUOC.map((b) => (
              <li
                key={b.so}
                className="flex flex-col justify-between gap-3 p-6 transition-colors hover:bg-slate-50/60"
              >
                <div className="flex flex-col gap-2">
                  <span className="w-fit rounded-md border border-teal-700/20 bg-teal-50 px-2.5 py-0.5 text-xs font-bold text-teal-900">
                    Bước {b.so}
                  </span>
                  <strong className="text-xl font-black tracking-tight text-slate-950">
                    <span className="sr-only">Bước {b.so}: </span>
                    {b.ten}
                  </strong>
                  <p className="text-base text-slate-600">{b.moTa}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
