// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Trang chủ cổng công dân: các bước làm thủ tục trực tuyến + danh mục thủ tục công khai.
import { useCallback, useEffect, useMemo, useState } from "react";
import { TheThuTuc } from "@/components/the-thu-tuc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    <div className="flex flex-col gap-8">
      <section aria-labelledby="gioi-thieu" className="flex flex-col gap-4">
        <h1 id="gioi-thieu" className="text-3xl font-bold leading-tight sm:text-4xl">
          Làm thủ tục hành chính của xã, không cần đi lại nhiều lần
        </h1>
        <ol className="grid gap-3 sm:grid-cols-3">
          {CAC_BUOC.map((b) => (
            <li key={b.so} className="flex gap-3 rounded-xl bg-secondary p-4 text-secondary-foreground">
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground"
              >
                {b.so}
              </span>
              <span>
                <strong className="block text-lg">{b.ten}</strong>
                <span className="text-base">{b.moTa}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="danh-muc" className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2 id="danh-muc" className="text-2xl font-bold">
            Danh mục thủ tục
          </h2>
          <label className="flex w-full flex-col gap-1 sm:max-w-sm">
            <span className="text-base font-semibold">Tìm thủ tục</span>
            <Input
              type="search"
              value={tuKhoa}
              onChange={(e) => datTuKhoa(e.target.value)}
              placeholder="Ví dụ: khai sinh, chứng thực"
            />
          </label>
        </div>

        {trangThai.loai === "dang-tai" && (
          <p role="status" className="text-lg text-muted-foreground">
            Đang tải danh mục thủ tục…
          </p>
        )}

        {trangThai.loai === "loi" && (
          <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border-2 border-destructive p-4">
            <p className="text-lg font-semibold text-destructive">{trangThai.thongDiep}</p>
            <Button onClick={tai}>Thử lại</Button>
          </div>
        )}

        {trangThai.loai === "xong" && (
          <>
            <p className="text-base text-muted-foreground" aria-live="polite">
              {loc.length === trangThai.danhSach.length
                ? `${loc.length} thủ tục nhận hồ sơ`
                : `Tìm thấy ${loc.length} / ${trangThai.danhSach.length} thủ tục`}
            </p>
            {loc.length === 0 ? (
              <p className="text-lg">Không có thủ tục nào khớp “{tuKhoa}”.</p>
            ) : (
              <ul className="grid gap-4 md:grid-cols-2">
                {loc.map((t) => (
                  <li key={t.id}>
                    <TheThuTuc thuTuc={t} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}
