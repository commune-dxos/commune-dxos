// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Chân trang cổng công dân (#141): nền slate-900 chia 4 cột (giới thiệu, dịch vụ, tài liệu, dự án) và dòng bản quyền.
import type { ReactNode } from "react";
import { Link } from "react-router";

function CotChanTrang({ tieuDe, children }: { tieuDe: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-bold tracking-[0.2em] text-white uppercase">{tieuDe}</h2>
      <ul className="flex flex-col gap-3">{children}</ul>
    </div>
  );
}

const LOP_LIEN_KET_CHAN = "text-slate-300 no-underline underline-offset-4 hover:text-white hover:underline";

export function ChanTrang() {
  return (
    <footer className="nen-toi border-t border-slate-800 bg-slate-900 text-slate-300">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div className="flex flex-col gap-4">
          <span className="flex items-center gap-3">
            {/* Quy tắc nhận diện: biểu tượng trong suốt đặt trong ô nền trắng khi nằm trên nền tối. */}
            <span className="flex size-12 items-center justify-center rounded-xl bg-white p-1">
              <img src="/mark-64.png" alt="" width={40} height={40} className="size-10" />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-lg font-black tracking-tight text-white">COMMUNE DX-OS</span>
              <span className="text-slate-400">Chính quyền số Cấp xã</span>
            </span>
          </span>
          <p>Làm thủ tục hành chính của xã trực tuyến: xem giấy tờ cần có, nộp hồ sơ, theo dõi kết quả.</p>
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
              Hỏi đáp thủ tục
            </Link>
          </li>
          <li>
            <Link to="/ho-so" className={LOP_LIEN_KET_CHAN}>
              Hồ sơ của tôi
            </Link>
          </li>
        </CotChanTrang>
        <CotChanTrang tieuDe="Tài liệu">
          <li>
            <a className={LOP_LIEN_KET_CHAN} href="https://commune-dxos.github.io/commune-dxos/">
              Tài liệu dự án
            </a>
          </li>
          <li>
            <a className={LOP_LIEN_KET_CHAN} href="https://commune-dxos.github.io/commune-dxos/thu-nghiem/">
              Hướng dẫn dùng thử
            </a>
          </li>
          <li>
            <a className={LOP_LIEN_KET_CHAN} href="https://github.com/commune-dxos/commune-dxos">
              Mã nguồn
            </a>
          </li>
        </CotChanTrang>
        <CotChanTrang tieuDe="Dự án">
          <li>Đội DTU_DZ_2 · OLP PMNM 2026</li>
          <li>Giấy phép GPL-3.0-or-later</li>
          <li>Bản thử nghiệm, dữ liệu mẫu</li>
        </CotChanTrang>
      </div>
      <div className="border-t border-slate-800">
        <p className="mx-auto max-w-6xl px-4 py-5 text-slate-400 sm:px-6">© 2026 DTU_DZ_2 · Phần mềm mã nguồn mở</p>
      </div>
    </footer>
  );
}
