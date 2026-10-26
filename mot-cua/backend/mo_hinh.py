# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Nhà cung cấp mô hình của trợ lý thủ tục (#91), chọn bằng biến LLM_PROVIDER. Chỉ thư viện chuẩn.

  ollama             Ollama (MIT) trong profile `ai` hoặc trên máy chủ: sinh bằng Qwen2.5 7B Instruct
                     (Apache-2.0), nhúng bằng bge-m3 (MIT). API /api/chat, /api/embed.
  openai-compatible  API ngoài theo chuẩn OpenAI (/chat/completions, /embeddings dưới LLM_BASE_URL, ví dụ
                     http://ollama:11434/v1 hoặc dịch vụ của nhà cung cấp). Khóa API (nếu cần) đọc từ OpenBao
                     dxos/tang2/<DXOS_TANG2>/llm (trường api_key), không đặt trong .env.
  tat                Không mô hình: trợ lý chỉ tìm kiếm Meilisearch và trả các đoạn khớp nhất.
  gia-lap            Không tải mô hình (CI, smoke): vector băm từ (rag.nhung_gia_lap) và câu trả lời trích
                     nguyên văn (rag.tra_loi_trich). Chạy đủ đường RAG (pgvector, dẫn nguồn) một cách tất định.

Giấy phép mô hình (D-004, NOTICE): chỉ Qwen2.5 bản Apache-2.0 (0.5B, 1.5B, 7B, 14B, 32B); bản 3B và 72B
dùng giấy phép riêng của Qwen nên bị từ chối, cũng như Llama và Gemma. Kiểm ngay lúc khởi động.
"""

import json
import os
import re
import urllib.error
import urllib.request

import rag

CHE_DO = ("ollama", "openai-compatible", "tat", "gia-lap")
# Tên mô hình không được phép (giấy phép không phải OSI): Qwen2.5 3B/72B, Llama, Gemma.
_CAM = re.compile(r"(qwen2\.5[^/]*?[:\-_ ](3b|72b))|llama|gemma", re.I)
LO_NHUNG = 16  # số đoạn mỗi lần gọi nhúng


class LoiMoHinh(Exception):
    """Mô hình không gọi được hoặc trả kết quả sai dạng (thông điệp không chứa khóa API)."""


def kiem_ten_mo_hinh(ten):
    if _CAM.search(ten or ""):
        raise ValueError(f"Mô hình {ten!r} không được phép: chỉ dùng mô hình giấy phép OSI (Qwen2.5 Apache-2.0 "
                         "trừ bản 3B/72B, bge-m3 MIT); không dùng Llama, Gemma (D-004)")
    return ten


def _post(url, body, headers=None, timeout=120):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise LoiMoHinh(f"{url.split('?')[0]} → HTTP {e.code}") from None
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
        raise LoiMoHinh(f"{url.split('?')[0]}: {e}") from None


class MoHinh:
    """Giao diện chung. co_sinh: có mô hình ngôn ngữ; nhan_nhung: nhãn mô hình nhúng (ghi vào cột mo_hinh
    của tri_thuc_doan) hoặc None khi không nhúng."""

    che_do = "tat"
    co_sinh = False
    nhan_nhung = None
    ten_sinh = None

    def nhung(self, ds_chu):
        raise LoiMoHinh("chế độ này không nhúng")

    def sinh(self, messages):
        raise LoiMoHinh("chế độ này không có mô hình ngôn ngữ")

    def _kiem_vector(self, ds):
        if not isinstance(ds, list) or any(not isinstance(v, list) or len(v) != rag.SO_CHIEU for v in ds):
            raise LoiMoHinh(f"mô hình nhúng phải trả vector {rag.SO_CHIEU} chiều (bge-m3)")
        return ds


class Tat(MoHinh):
    pass


class GiaLap(MoHinh):
    che_do = "gia-lap"
    co_sinh = True
    nhan_nhung = "gia-lap/bam-tu"
    ten_sinh = "gia-lap/trich-nguyen-van"

    def nhung(self, ds_chu):
        return [rag.nhung_gia_lap(c) for c in ds_chu]

    def sinh(self, messages):
        # Lấy lại câu hỏi và nguồn [1] từ lời nhắc (cùng định dạng rag.loi_nhac dựng).
        noi_dung = messages[-1]["content"]
        cau_hoi = re.search(r"<cau_hoi>(.*)</cau_hoi>", noi_dung, re.S)
        khoi = re.search(r"\[1\] \((.*?)\)\n(.*?)(?:\n\n\[2\] |\n\n<cau_hoi>)", noi_dung, re.S)
        if not khoi:
            return rag.KHONG_CO_THONG_TIN
        tieu_de = khoi.group(1).split(" – ", 1)[-1] if " – " in khoi.group(1) else khoi.group(1)
        return rag.tra_loi_trich(cau_hoi.group(1) if cau_hoi else "", [{"tieu_de": tieu_de, "noi_dung": khoi.group(2)}])


class Ollama(MoHinh):
    che_do = "ollama"
    co_sinh = True

    def __init__(self, url, mo_hinh, mo_hinh_nhung, timeout):
        self.url, self.timeout = url.rstrip("/"), timeout
        self.ten_sinh, self.ten_nhung = kiem_ten_mo_hinh(mo_hinh), kiem_ten_mo_hinh(mo_hinh_nhung)
        self.nhan_nhung = f"ollama/{mo_hinh_nhung}"

    def nhung(self, ds_chu):
        kq = []
        for i in range(0, len(ds_chu), LO_NHUNG):
            data = _post(f"{self.url}/api/embed", {"model": self.ten_nhung, "input": ds_chu[i:i + LO_NHUNG]},
                         timeout=self.timeout)
            kq.extend(data.get("embeddings") or [])
        return self._kiem_vector(kq)

    def sinh(self, messages):
        data = _post(f"{self.url}/api/chat", {
            "model": self.ten_sinh, "messages": messages, "stream": False, "keep_alive": "30m",
            "options": {"temperature": 0.1, "num_predict": 300, "num_ctx": 4096},
        }, timeout=self.timeout)
        tra_loi = ((data or {}).get("message") or {}).get("content")
        if not isinstance(tra_loi, str):
            raise LoiMoHinh("Ollama trả lời sai dạng")
        return tra_loi


class OpenAITuongThich(MoHinh):
    che_do = "openai-compatible"
    co_sinh = True

    def __init__(self, url, mo_hinh, mo_hinh_nhung, timeout, lay_khoa):
        self.url, self.timeout, self.lay_khoa = url.rstrip("/"), timeout, lay_khoa
        self.ten_sinh, self.ten_nhung = kiem_ten_mo_hinh(mo_hinh), kiem_ten_mo_hinh(mo_hinh_nhung)
        self.nhan_nhung = f"openai-compatible/{mo_hinh_nhung}"

    def _tieu_de(self):
        khoa = self.lay_khoa()
        return {"Authorization": f"Bearer {khoa}"} if khoa else {}

    def nhung(self, ds_chu):
        kq = []
        for i in range(0, len(ds_chu), LO_NHUNG):
            data = _post(f"{self.url}/embeddings", {"model": self.ten_nhung, "input": ds_chu[i:i + LO_NHUNG]},
                         self._tieu_de(), self.timeout)
            hang = sorted(data.get("data") or [], key=lambda x: x.get("index", 0))
            kq.extend(x.get("embedding") for x in hang)
        return self._kiem_vector(kq)

    def sinh(self, messages):
        data = _post(f"{self.url}/chat/completions", {
            "model": self.ten_sinh, "messages": messages, "temperature": 0.1, "max_tokens": 300,
        }, self._tieu_de(), self.timeout)
        try:
            tra_loi = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError):
            raise LoiMoHinh("API trả lời sai dạng") from None
        if not isinstance(tra_loi, str):
            raise LoiMoHinh("API trả lời sai dạng")
        return tra_loi


def tu_moi_truong(env=None, lay_khoa=lambda: None):
    """Dựng nhà cung cấp theo biến môi trường. Giá trị lạ hay mô hình bị cấm → ValueError (dừng khi khởi động)."""
    env = os.environ if env is None else env
    che_do = (env.get("LLM_PROVIDER") or "tat").strip().lower()
    if che_do not in CHE_DO:
        raise ValueError(f"LLM_PROVIDER={che_do!r} không hợp lệ; chọn một trong: {', '.join(CHE_DO)}")
    timeout = float(env.get("LLM_TIMEOUT") or 170)
    mo_hinh = env.get("LLM_MODEL") or "qwen2.5:7b"
    nhung = env.get("LLM_EMBED_MODEL") or "bge-m3"
    if che_do == "ollama":
        return Ollama(env.get("LLM_BASE_URL") or "http://ollama:11434", mo_hinh, nhung, timeout)
    if che_do == "openai-compatible":
        url = env.get("LLM_BASE_URL")
        if not url:
            raise ValueError("LLM_PROVIDER=openai-compatible cần LLM_BASE_URL (ví dụ https://…/v1)")
        return OpenAITuongThich(url, mo_hinh, nhung, timeout, lay_khoa)
    return GiaLap() if che_do == "gia-lap" else Tat()
