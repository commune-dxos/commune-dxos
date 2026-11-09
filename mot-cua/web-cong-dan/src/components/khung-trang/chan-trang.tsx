// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Chân trang cổng công dân (#141): giao diện sáng sủa hiện đại chia 4 cột và dòng bản quyền.
import type { ReactNode } from "react";
import { Link } from "react-router";

function CotChanTrang({ tieuDe, children }: { tieuDe: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-bold tracking-[0.15em] text-slate-900 uppercase">{tieuDe}</h2>
      <ul className="flex flex-col gap-2.5">{children}</ul>
    </div>
  );
}

const LOP_LIEN_KET_CHAN = "text-slate-600 no-underline underline-offset-4 transition-colors hover:text-primary hover:underline";

export function ChanTrang() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50/90 text-slate-700">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div className="flex flex-col gap-4">
          <span className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-xl border border-teal-600/20 bg-white p-1 shadow-sm">
              <img src="/mark-64.png" alt="" width={40} height={40} className="size-10" />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-lg font-black tracking-tight text-slate-900">COMMUNE DX-OS</span>
              <span className="text-sm font-medium text-slate-600">Chính quyền số Cấp xã</span>
            </span>
          </span>
          <p className="text-slate-600">
            Hệ thống dịch vụ công cấp xã trực tuyến: tra cứu thủ tục, nộp hồ sơ có ký số và theo dõi kết quả minh bạch.
          </p>
        </div>
        <CotChanTrang tieuDe="Dịch vụ">
          <li>
            <Link to="/#danh-muc" className={LOP_LIEN_KET_CHAN}>
              Danh mục thủ tục
            </Link>
          </li>
          <li>
            <Link to="/tra-cuu" className={LOP_LIEN_KET_CHAN}>
              Tra cứu hồ sơ
            </Link>
          </li>
          <li>
            <Link to="/hoi-dap" className={LOP_LIEN_KET_CHAN}>
              Hỏi đáp thủ tục AI
            </Link>
          </li>
          <li>
            <Link to="/ho-so" className={LOP_LIEN_KET_CHAN}>
              Hồ sơ của tôi
            </Link>
          </li>
        </CotChanTrang>
        <CotChanTrang tieuDe="Tài liệu & Kết nối">
          <li>
            <a className={LOP_LIEN_KET_CHAN} href="https://commune-dxos.github.io/commune-dxos/">
              Tài liệu kiến trúc
            </a>
          </li>
          <li>
            <a className={LOP_LIEN_KET_CHAN} href="https://commune-dxos.github.io/commune-dxos/thu-nghiem/">
              Hướng dẫn dùng thử
            </a>
          </li>
          <li>
            <Link to="/can-bo" className={LOP_LIEN_KET_CHAN}>
              Cổng cán bộ & điều hành
            </Link>
          </li>
          <li>
            <a className={LOP_LIEN_KET_CHAN} href="https://github.com/commune-dxos/commune-dxos">
              Mã nguồn mở (GitHub)
            </a>
          </li>
        </CotChanTrang>
        <CotChanTrang tieuDe="Dự án">
          <li className="text-slate-600">Đội DTU_DZ_2 · OLP PMNM 2026</li>
          <li className="text-slate-600">Giấy phép GPL-3.0-or-later</li>
          <li className="text-slate-600">Môi trường thử nghiệm dữ liệu mẫu</li>
        </CotChanTrang>
      </div>
      <div className="border-t border-slate-200 bg-white">
        <p className="mx-auto max-w-6xl px-4 py-4 text-sm text-slate-500 sm:px-6">
          © 2026 DTU_DZ_2 · Commune DX-OS · Phần mềm nguồn mở cấp xã
        </p>
      </div>
    </footer>
  );
}
