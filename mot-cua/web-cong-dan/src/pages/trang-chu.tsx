// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Trang chủ cổng công dân: khối tìm thủ tục, danh mục thủ tục công khai, các bước làm thủ tục.
import { RotateCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TheThuTuc } from "@/components/the-thu-tuc";
import { ThongBao } from "@/components/thong-bao";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { layDanhMucThuTuc, LoiApi, type ThuTuc } from "@/lib/api";
import { chuanHoa } from "@/lib/dinh-dang";

type TrangThai =
  | { loai: "dang-tai" }
  | { loai: "loi"; thongDiep: string }
  | { loai: "xong"; danhSach: ThuTuc[] };

const CAC_BUOC = [
  { so: 1, ten: "Chọn thủ tục", moTa: "Xem thời hạn, lệ phí và giấy tờ cần có." },
  { so: 2, ten: "Nộp hồ sơ trực tuyến", moTa: "Điền thông tin, tải ảnh hoặc bản quét giấy tờ." },
  { so: 3, ten: "Theo dõi tiến độ", moTa: "Biết hồ sơ đang ở bước nào, khi nào có kết quả." },
];

export function TrangChu({ taiDanhMuc = layDanhMucThuTuc }: { taiDanhMuc?: () => Promise<ThuTuc[]> }) {
  const [trangThai, datTrangThai] = useState<TrangThai>({ loai: "dang-tai" });
  const [tuKhoa, datTuKhoa] = useState("");

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

  const loc = useMemo(() => {
    if (trangThai.loai !== "xong") return [];
    const k = chuanHoa(tuKhoa);
    if (!k) return trangThai.danhSach;
    return trangThai.danhSach.filter((t) =>
      chuanHoa(`${t.ma} ${t.ten} ${t.linh_vuc?.ten ?? ""}`).includes(k),
    );
  }, [trangThai, tuKhoa]);

  return (
    <>
      <section aria-labelledby="gioi-thieu" className="nen-dam bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:py-14">
          <div className="flex max-w-3xl flex-col gap-3">
            <h1 id="gioi-thieu" className="text-2xl font-bold sm:text-4xl">
              Làm thủ tục hành chính của xã, không cần đi lại nhiều lần
            </h1>
            <p className="text-lg text-primary-foreground">
              Xem giấy tờ cần có, nộp hồ sơ trực tuyến và theo dõi kết quả tại một nơi.
            </p>
          </div>
          <div role="search" className="flex max-w-2xl flex-col gap-2">
            <Label htmlFor="tim-thu-tuc" className="text-lg text-primary-foreground">
              Tìm thủ tục
            </Label>
            <InputGroup className="h-14 border-white bg-background text-foreground">
              <InputGroupAddon className="text-muted-foreground [&>svg]:size-6">
                <Search aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                id="tim-thu-tuc"
                type="search"
                value={tuKhoa}
                onChange={(e) => datTuKhoa(e.target.value)}
                placeholder="Ví dụ: khai sinh"
                autoComplete="off"
                className="h-full text-lg"
              />
            </InputGroup>
            <p className="text-base text-primary-foreground">Gõ không dấu cũng tìm được.</p>
          </div>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-14 px-4 pt-10 pb-16 sm:px-6 md:pt-12 md:pb-20">
        <section id="danh-muc" aria-labelledby="tieu-de-danh-muc" className="flex flex-col gap-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 id="tieu-de-danh-muc" className="text-2xl font-bold">
              Danh mục thủ tục
            </h2>
            {trangThai.loai === "xong" && (
              <p className="text-base text-muted-foreground" aria-live="polite">
                {loc.length === trangThai.danhSach.length
                  ? `${loc.length} thủ tục nhận hồ sơ`
                  : `Tìm thấy ${loc.length} / ${trangThai.danhSach.length} thủ tục`}
              </p>
            )}
          </div>

          {trangThai.loai === "dang-tai" && (
            <div role="status" className="flex flex-col gap-4">
              <span className="sr-only">Đang tải danh mục thủ tục…</span>
              {[0, 1].map((i) => (
                <div key={i} aria-hidden="true" className="flex flex-col gap-4 rounded-md border bg-card p-6">
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-8 w-2/3" />
                  <Skeleton className="h-6 w-1/2" />
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
              <ul className="flex flex-col gap-4">
                {loc.map((t) => (
                  <li key={t.id}>
                    <TheThuTuc thuTuc={t} />
                  </li>
                ))}
              </ul>
            ))}
        </section>

        <section id="huong-dan" aria-labelledby="tieu-de-huong-dan" className="flex flex-col gap-5 border-t pt-10">
          <h2 id="tieu-de-huong-dan" className="text-2xl font-bold">
            Làm thủ tục trực tuyến thế nào?
          </h2>
          <ol className="grid gap-6 md:grid-cols-3">
            {CAC_BUOC.map((b) => (
              <li key={b.so} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-primary text-lg font-bold text-primary"
                >
                  {b.so}
                </span>
                <span className="flex flex-col gap-1">
                  <strong className="text-lg">{b.ten}</strong>
                  <span className="text-muted-foreground">{b.moTa}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
