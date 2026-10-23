// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { Link } from "react-router";
import { Khung } from "@/components/khung";

export function KhongThay() {
  return (
    <Khung>
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold">Không tìm thấy trang</h1>
        <Link to="/" className="text-lg text-primary underline">
          Về danh mục thủ tục
        </Link>
      </section>
    </Khung>
  );
}
