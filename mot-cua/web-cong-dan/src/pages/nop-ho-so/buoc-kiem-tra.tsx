// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Bước 3: "Kiểm tra lại thông tin" (mẫu check answers của GOV.UK): mỗi dòng có liên kết "Thay đổi"
// quay về đúng bước; nộp kèm lời cam đoan. Hồ sơ đã tạo trên máy chủ (nộp dở) thì khóa "Thay đổi".
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { ThuTuc } from "@/lib/api";
import type { ThanhPhan } from "@/lib/thanh-phan";
import type { NguoiNop } from "./kieu";

function Bang({ tieuDe, children }: { tieuDe: string; children: ReactNode }) {
  return (
    <section aria-label={tieuDe} className="flex flex-col gap-3">
      <h2 className="text-xl font-bold">{tieuDe}</h2>
      <dl className="divide-y border-y">{children}</dl>
    </section>
  );
}

function Dong({ nhan, children, sua, nhanSua }: { nhan: string; children: ReactNode; sua?: string; nhanSua?: string }) {
  return (
    <div className="grid gap-x-6 gap-y-1 py-4 sm:grid-cols-[14rem_1fr_auto]">
      <dt className="font-semibold">{nhan}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
      {sua && (
        <dd>
          <Link to={sua} className="rounded-sm text-link underline underline-offset-4 hover:decoration-2">
            Thay đổi<span className="sr-only"> {nhanSua ?? nhan.toLowerCase()}</span>
          </Link>
        </dd>
      )}
    </div>
  );
}

export function BuocKiemTra({
  thuTuc,
  nguoiNop,
  thanhPhan,
  tep,
  goc,
  khoaSua = false,
}: {
  thuTuc: ThuTuc;
  nguoiNop: NguoiNop;
  thanhPhan: ThanhPhan[];
  tep: Record<string, File[]>;
  goc: string;
  khoaSua?: boolean;
}) {
  const sua = (d: string) => (khoaSua ? undefined : `${goc}/${d}`);
  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <Bang tieuDe="Thủ tục">
        <Dong nhan="Tên thủ tục">{thuTuc.ten}</Dong>
        <Dong nhan="Mã thủ tục">{thuTuc.ma}</Dong>
      </Bang>
      <Bang tieuDe="Người nộp hồ sơ">
        <Dong nhan="Họ và tên" sua={sua("nguoi-nop")}>
          {nguoiNop.hoTen}
        </Dong>
        <Dong nhan="Số điện thoại" sua={sua("nguoi-nop")}>
          {nguoiNop.soDienThoai}
        </Dong>
      </Bang>
      <Bang tieuDe="Giấy tờ kèm theo">
        {thanhPhan.map((tp) => {
          const ds = tep[tp.ma] ?? [];
          return (
            <Dong key={tp.ma} nhan={tp.ten} sua={sua("giay-to")} nhanSua={tp.ten.toLowerCase()}>
              {ds.length ? (
                <ul>
                  {ds.map((f, i) => (
                    <li key={`${f.name}-${i}`}>{f.name}</li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted-foreground">Không nộp</span>
              )}
            </Dong>
          );
        })}
      </Bang>
      <section aria-labelledby="cam-doan" className="flex flex-col gap-3">
        <h2 id="cam-doan" className="text-xl font-bold">
          Cam đoan
        </h2>
        <p>
          Khi bấm nộp, bạn cam đoan thông tin và giấy tờ trên là đúng sự thật, và chịu trách nhiệm trước pháp luật về nội
          dung đã khai.
        </p>
      </section>
    </div>
  );
}
