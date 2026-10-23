// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Chỗ giữ trang nộp hồ sơ. Form sinh từ JSON Schema của gói + Poka-yoke + tải tệp làm ở #53, giao diện ở #64.
import { Link, useParams } from "react-router";
import { Khung } from "@/components/khung";
import { buttonVariants } from "@/components/ui/button";

export function NopHoSo() {
  const { ma = "" } = useParams();
  return (
    <Khung>
      <section aria-labelledby="nop-ho-so" className="flex max-w-2xl flex-col gap-4">
        <h1 id="nop-ho-so" className="text-3xl font-bold">
          Nộp hồ sơ <span className="whitespace-nowrap">{ma}</span>
        </h1>
        <p className="rounded-xl bg-accent p-4 text-lg text-accent-foreground">
          <strong>Sắp có.</strong> Chức năng nộp hồ sơ trực tuyến đang được hoàn thiện. Trong lúc chờ, bạn vẫn nộp được
          hồ sơ tại bộ phận một cửa của xã.
        </p>
        <Link to="/" className={buttonVariants({ variant: "outline", className: "self-start" })}>
          ← Về danh mục thủ tục
        </Link>
      </section>
    </Khung>
  );
}
