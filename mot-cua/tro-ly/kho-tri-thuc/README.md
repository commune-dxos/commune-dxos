# Kho tri thức của trợ lý thủ tục (#91)

Tài liệu công khai mà trợ lý thủ tục hành chính (`mot-cua/backend/tro_ly.py`) dùng để trả lời người dân. Bộ nạp `nap-tri-thuc` (`mot-cua/backend/nap_tri_thuc.py`, `make nap-tri-thuc`) đọc mọi tệp `*.md` ở đây (trừ tệp này) cùng các gói `thu-tuc/*/`, chia đoạn, ghi vào Meilisearch (tìm từ khóa) và pgvector (tìm ngữ nghĩa). Sửa tệp rồi chạy `make nap-tri-thuc`: đoạn không đổi thì không nhúng lại.

## Định dạng

```markdown
---
ma: HT02                  # 2–20 chữ/số, không trùng giữa các tệp; id đoạn = <ma>-<thứ tự>
ten: Đăng ký kết hôn      # ghép vào tiêu đề từng đoạn: "Đăng ký kết hôn – Hồ sơ"
lien_ket: /thu-tuc/HT02   # tùy chọn: đường dẫn trên cổng công dân hiện cạnh nguồn
ma_thu_tuc: KS01          # tùy chọn: khi tài liệu nói về một thủ tục có mã khác `ma`
---
# Tiêu đề (bỏ qua, trùng `ten`)

## Mục 1        ← mỗi mục ## là một đoạn (mục dài quá 1.800 ký tự được cắt theo đoạn văn)
```

Mỗi mục nên tự đủ nghĩa (người đọc thấy riêng mục đó vẫn hiểu), vì trợ lý chỉ đưa vài đoạn khớp nhất cho mô hình. Ghi căn cứ pháp lý trong mục riêng. `make check` kiểm định dạng (`nap_tri_thuc.py --chi-kiem`).

## Nguồn và quyền tác giả

Nội dung là bản tóm tắt do đội viết từ văn bản quy phạm pháp luật (Luật Hộ tịch 2014, Luật Hôn nhân và gia đình 2014, Nghị định 123/2015/NĐ-CP, Nghị định 23/2015/NĐ-CP, Thông tư 226/2016/TT-BTC…). Văn bản quy phạm pháp luật không thuộc đối tượng bảo hộ quyền tác giả (Luật Sở hữu trí tuệ, Điều 15). Bản tóm tắt phát hành theo GPL-3.0-or-later như phần còn lại của dự án (`REUSE.toml`).

Đây là dữ liệu cho **bản thử nghiệm**: quy định có thể đã được sửa đổi (ví dụ khi tổ chức chính quyền địa phương hai cấp). Trước khi dùng thật, xã đối chiếu với Cổng Dịch vụ công quốc gia và văn bản hiện hành. Giờ làm việc, địa chỉ trong `mot-cua-chung.md` là của "xã mẫu".
