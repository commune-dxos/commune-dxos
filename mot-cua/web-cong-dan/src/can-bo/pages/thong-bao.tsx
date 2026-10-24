// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Hộp thông báo của cán bộ (#56): thông báo sắp trễ hạn do consumer RabbitMQ của mot-cua-worker ghi, mới
// nhất trước, chưa đọc nổi bật; bấm mở hồ sơ thì đánh dấu đã đọc. Kênh email/SMS chạy ở chế độ giả lập: ghi
// rõ "giả lập" để không ai tưởng đã có tin nhắn thật. Dữ liệu từ du-lieu.tsx (luồng SSE + tải lại định kỳ).
import { BellOff, CheckCheck, Mail, MessageSquareText } from "lucide-react";
import { Link } from "react-router";
import { GOC_CAN_BO } from "@/auth/oidc";
import { ThongBao as KhoiThongBao } from "@/components/thong-bao";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ngay } from "@/lib/dinh-dang";
import { ngayGio } from "@/lib/han";
import { cn } from "@/lib/utils";
import { useDuLieuCanBo } from "../du-lieu";

const TEN_KENH = { email: "Email", sms: "SMS" } as const;

export function HopThongBao() {
  const { thongBao, chuaDoc, danhDauDaDoc } = useDuLieuCanBo();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Thông báo</h1>
          <p className="text-muted-foreground">
            Hồ sơ thuộc lĩnh vực bạn phụ trách sắp tới hạn xử lý. Thông báo mới hiện ngay, không cần tải lại trang.
          </p>
        </div>
        {chuaDoc > 0 && (
          <Button variant="outline" onClick={() => void danhDauDaDoc(thongBao.filter((t) => !t.da_doc_luc).map((t) => t.id))}>
            <CheckCheck aria-hidden="true" />
            Đánh dấu đã đọc tất cả ({chuaDoc})
          </Button>
        )}
      </div>
      {thongBao.length === 0 ? (
        <KhoiThongBao loai="trong" bieuTuong={BellOff} tieuDe="Chưa có thông báo nào">
          Khi hồ sơ của lĩnh vực bạn phụ trách còn 1 ngày làm việc tới hạn, thông báo sẽ hiện ở đây và ở chuông đầu
          trang.
        </KhoiThongBao>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Danh sách thông báo">
          {thongBao.map((t) => (
            <li
              key={t.id}
              data-da-doc={t.da_doc_luc ? "co" : "chua"}
              className={cn("rounded-md border bg-card p-4 shadow-the", !t.da_doc_luc && "border-l-4 border-l-warning")}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`${GOC_CAN_BO}/ho-so/${t.ho_so_id}`}
                      onClick={() => !t.da_doc_luc && void danhDauDaDoc([t.id])}
                      className="font-semibold text-link underline-offset-4 hover:underline"
                    >
                      {t.tieu_de}
                    </Link>
                    {!t.da_doc_luc && <Badge variant="destructive">Mới</Badge>}
                  </span>
                  <span>{t.noi_dung}</span>
                  <span className="text-sm text-muted-foreground">
                    {ngayGio(new Date(t.tao_luc))} · hạn {ngay(t.moc)}
                    {t.da_doc_luc && ` · đã đọc ${ngayGio(new Date(t.da_doc_luc))}`}
                  </span>
                </div>
                {!t.da_doc_luc && (
                  <Button variant="ghost" size="sm" onClick={() => void danhDauDaDoc([t.id])}>
                    Đánh dấu đã đọc
                  </Button>
                )}
              </div>
              {t.thong_bao_kenh.length > 0 && (
                <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  {t.thong_bao_kenh.map((k) => (
                    <span key={k.kenh} className="inline-flex items-center gap-1">
                      {k.kenh === "email" ? <Mail aria-hidden="true" className="size-4" /> : <MessageSquareText aria-hidden="true" className="size-4" />}
                      {TEN_KENH[k.kenh]} (giả lập, không gửi thật)
                    </span>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
