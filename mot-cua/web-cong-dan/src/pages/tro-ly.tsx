// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Hỏi đáp thủ tục (/hoi-dap, #91): ô chat của trợ lý RAG, không cần đăng nhập. Mỗi câu trả lời hiện trích dẫn [n] thành
// liên kết tới nguồn n ngay bên dưới (đoạn tài liệu, mã thủ tục, đường dẫn trang thủ tục). Khi trợ lý chỉ tìm
// kiếm (chưa bật mô hình) hay mô hình lỗi, hiện các đoạn tài liệu liên quan kèm lời giải thích. Câu hỏi chỉ nằm
// trong trang (không lưu); ?ma=KS01 hỏi riêng về một thủ tục, ?q=… điền sẵn câu hỏi.
import { BookOpenText, MessageCircleQuestionMark, SendHorizontal, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { Khung } from "@/components/khung";
import { ThongBao } from "@/components/thong-bao";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { LoiApi } from "@/lib/api";
import {
  hoiTroLy,
  kiemCauHoi,
  nhanCheDo,
  tachTrichDan,
  thongTinTroLy,
  TOI_DA_CAU_HOI,
  type ThongTinTroLy,
  type TraLoiTroLy,
} from "@/lib/tro-ly";

const GOI_Y = [
  "Đăng ký kết hôn cần những giấy tờ gì?",
  "Bao lâu sau khi sinh phải đăng ký khai sinh cho con?",
  "Lệ phí chứng thực bản sao bao nhiêu tiền?",
  "Giấy xác nhận tình trạng hôn nhân có giá trị bao lâu?",
];

type Luot =
  | { id: number; cauHoi: string; loai: "dang-hoi" }
  | { id: number; cauHoi: string; loai: "loi"; thongDiep: string }
  | { id: number; cauHoi: string; loai: "xong"; traLoi: TraLoiTroLy };

function CauTraLoi({ luotId, traLoi }: { luotId: number; traLoi: TraLoiTroLy }) {
  const nguon = traLoi.nguon;
  return (
    <div className="flex flex-col gap-4">
      {traLoi.cau_tra_loi && (
        <p className="text-lg leading-relaxed whitespace-pre-line">
          {tachTrichDan(traLoi.cau_tra_loi, nguon.length).map((p, i) =>
            p.loai === "chu" ? (
              <span key={i}>{p.noiDung}</span>
            ) : (
              <a
                key={i}
                href={`#nguon-${luotId}-${p.so}`}
                className="mx-0.5 inline-flex min-w-7 items-center justify-center rounded-md bg-primary-soft px-1.5 align-baseline text-base font-semibold text-primary no-underline hover:underline"
                aria-label={`Nguồn ${p.so}: ${nguon[p.so - 1]?.tieu_de ?? ""}`}
              >
                {p.so}
              </a>
            ),
          )}
        </p>
      )}
      {traLoi.thong_bao && (
        <p role="note" className="rounded-md border-l-4 border-warning bg-surface px-4 py-3">
          {traLoi.thong_bao}
        </p>
      )}
      {traLoi.trich_tu_dong && (
        <p className="text-sm text-muted-foreground">
          Mô hình không dẫn được nguồn nên câu trả lời trên được trích nguyên văn từ tài liệu.
        </p>
      )}
      {nguon.length > 0 && (
        <section aria-label="Nguồn tham khảo" className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 font-bold">
            <BookOpenText aria-hidden="true" className="size-5 text-primary" />
            {traLoi.cau_tra_loi ? "Nguồn" : "Tài liệu liên quan"}
          </h3>
          <ol className="flex flex-col gap-2">
            {nguon.map((n) => (
              <li
                key={n.id}
                id={`nguon-${luotId}-${n.so}`}
                className={`flex gap-3 rounded-md border px-4 py-3 ${n.duoc_trich ? "border-primary bg-primary-soft/40" : ""}`}
              >
                <span className="font-bold text-primary tabular-nums" aria-hidden="true">
                  [{n.so}]
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2 font-semibold">
                    {n.tieu_de}
                    {n.ma_thu_tuc && <Badge variant="secondary">{n.ma_thu_tuc}</Badge>}
                  </span>
                  <span className="text-muted-foreground">{n.trich}</span>
                  {n.lien_ket?.startsWith("/") && (
                    <Link to={n.lien_ket} className="text-link underline">
                      Xem thủ tục và nộp hồ sơ
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

export function TroLy({
  hoi = hoiTroLy,
  layThongTin = thongTinTroLy,
}: {
  hoi?: (cauHoi: string, ma: string | null) => Promise<TraLoiTroLy>;
  layThongTin?: () => Promise<ThongTinTroLy>;
}) {
  const [tham, datTham] = useSearchParams();
  const ma = tham.get("ma");
  const [cauHoi, datCauHoi] = useState(tham.get("q") ?? "");
  const [loi, datLoi] = useState<string | null>(null);
  const [luot, datLuot] = useState<Luot[]>([]);
  const [thongTin, datThongTin] = useState<ThongTinTroLy | null>(null);
  const soLuot = useRef(0);
  const cuoi = useRef<HTMLDivElement>(null);
  const dangHoi = luot.some((l) => l.loai === "dang-hoi");

  useEffect(() => {
    let huy = false;
    layThongTin()
      .then((tt) => !huy && datThongTin(tt))
      .catch(() => undefined);
    return () => {
      huy = true;
    };
  }, [layThongTin]);

  useEffect(() => {
    cuoi.current?.scrollIntoView?.({ block: "nearest" });
  }, [luot]);

  const gui = async (q: string) => {
    const l = kiemCauHoi(q);
    datLoi(l);
    if (l || dangHoi) return;
    const id = ++soLuot.current;
    datLuot((ds) => [...ds, { id, cauHoi: q.trim(), loai: "dang-hoi" }]);
    datCauHoi("");
    try {
      const traLoi = await hoi(q, ma);
      datLuot((ds) => ds.map((x) => (x.id === id ? { id, cauHoi: x.cauHoi, loai: "xong", traLoi } : x)));
    } catch (e) {
      const thongDiep = e instanceof LoiApi ? e.message : "Trợ lý chưa trả lời được. Vui lòng thử lại.";
      datLuot((ds) => ds.map((x) => (x.id === id ? { id, cauHoi: x.cauHoi, loai: "loi", thongDiep } : x)));
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void gui(cauHoi);
  };
  // Enter gửi, Shift+Enter xuống dòng.
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void gui(cauHoi);
    }
  };

  return (
    <Khung className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold">Hỏi đáp thủ tục</h1>
        <p className="text-lg text-muted-foreground">
          Hỏi về giấy tờ, thời hạn, lệ phí, nơi nộp của các thủ tục hành chính cấp xã. Trợ lý chỉ trả lời từ tài liệu
          thủ tục của xã và ghi rõ nguồn; không cần đăng nhập, câu hỏi không được lưu.
        </p>
        {thongTin && <p className="text-base text-muted-foreground">{nhanCheDo(thongTin)}</p>}
        {ma && (
          <p className="flex flex-wrap items-center gap-2">
            Đang hỏi riêng về thủ tục <Badge>{ma}</Badge>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                const moi = new URLSearchParams(tham);
                moi.delete("ma");
                datTham(moi);
              }}
            >
              <X aria-hidden="true" />
              Hỏi mọi thủ tục
            </Button>
          </p>
        )}
      </div>

      <div aria-live="polite" className="flex flex-col gap-6">
        {luot.length === 0 && (
          <div className="flex flex-col gap-3">
            <p className="font-semibold">Câu hỏi gợi ý</p>
            <ul className="flex flex-wrap gap-2">
              {GOI_Y.map((g) => (
                <li key={g}>
                  <Button variant="outline" size="sm" className="h-auto min-h-11 py-2 text-left whitespace-normal" onClick={() => void gui(g)}>
                    {g}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {luot.map((l) => (
          <article key={l.id} aria-label={`Câu hỏi: ${l.cauHoi}`} className="flex flex-col gap-4">
            <p className="flex items-start gap-3 self-end rounded-lg bg-muted px-4 py-3 text-lg">
              <UserRound aria-hidden="true" className="mt-1 size-5 shrink-0 text-muted-foreground" />
              <span className="sr-only">Bạn hỏi: </span>
              {l.cauHoi}
            </p>
            <div className="flex gap-3">
              <MessageCircleQuestionMark aria-hidden="true" className="mt-1 size-6 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <span className="sr-only">Trợ lý trả lời: </span>
                {l.loai === "dang-hoi" && (
                  <p role="status" className="text-lg text-muted-foreground">
                    Đang tra cứu tài liệu và soạn câu trả lời… (có thể mất đến một phút)
                  </p>
                )}
                {l.loai === "loi" && (
                  <ThongBao loai="loi" tieuDe="Chưa trả lời được" role="alert" className="items-start text-left">
                    {l.thongDiep}
                  </ThongBao>
                )}
                {l.loai === "xong" && <CauTraLoi luotId={l.id} traLoi={l.traLoi} />}
              </div>
            </div>
          </article>
        ))}
        <div ref={cuoi} />
      </div>

      <form noValidate onSubmit={onSubmit} aria-label="Gửi câu hỏi cho trợ lý" className="flex flex-col gap-3">
        <Field data-invalid={!!loi}>
          <FieldLabel htmlFor="cau-hoi">Câu hỏi của bạn</FieldLabel>
          <FieldDescription id="cau-hoi-goi-y">
            Không nhập số giấy tờ, số điện thoại hay thông tin cá nhân. Enter để gửi, Shift+Enter để xuống dòng.
          </FieldDescription>
          {loi && (
            <FieldError role={undefined} id="cau-hoi-loi">
              {loi}
            </FieldError>
          )}
          <Textarea
            id="cau-hoi"
            rows={2}
            maxLength={TOI_DA_CAU_HOI}
            aria-describedby={["cau-hoi-goi-y", loi && "cau-hoi-loi"].filter(Boolean).join(" ")}
            aria-invalid={loi ? true : undefined}
            value={cauHoi}
            onChange={(e) => datCauHoi(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Trợ lý tự động chỉ để tham khảo. Cần chắc chắn, hãy hỏi Bộ phận Một cửa hoặc{" "}
            <Link to="/" className="text-link underline">
              xem danh mục thủ tục
            </Link>
            .
          </p>
          <Button type="submit" disabled={dangHoi}>
            <SendHorizontal aria-hidden="true" />
            Gửi câu hỏi
          </Button>
        </div>
      </form>
    </Khung>
  );
}
