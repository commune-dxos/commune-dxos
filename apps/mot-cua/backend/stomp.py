# SPDX-License-Identifier: Apache-2.0
"""Client STOMP 1.2 tối thiểu cho RabbitMQ (plugin rabbitmq_stomp của lõi, #9), chỉ thư viện
chuẩn Python.

Vì sao STOMP mà không phải AMQP 0-9-1: backend chạy trên image python gốc, không cài gói
(không có pika); STOMP là giao thức văn bản, viết đúng trong vài chục dòng và RabbitMQ hỗ trợ
sẵn những gì cần cho độ tin cậy:
  - SEND kèm `receipt`: RabbitMQ chỉ trả RECEIPT sau khi broker đã nhận và ghi tin nhắn
    (publisher confirm) → publisher biết chắc tin đã vào hàng đợi mới đánh dấu đã phát.
  - SUBSCRIBE `ack: client-individual` + `prefetch-count`: consumer ACK từng tin sau khi xử
    lý xong; mất kết nối trước khi ACK thì RabbitMQ giao lại tin đó.
  - NACK `requeue: false`: tin hỏng đi sang dead-letter exchange khai báo trong topology.
Đích: `/exchange/<exchange>/<routing key>` để phát, `/amq/queue/<queue>` để nhận từ hàng
đợi đã khai báo (client không tự khai báo gì, user ứng dụng không có quyền configure).
"""

import socket

NUL = b"\x00"

_THOAT = {"\\": "\\\\", "\r": "\\r", "\n": "\\n", ":": "\\c"}
_BO_THOAT = {"\\\\": "\\", "\\r": "\r", "\\n": "\n", "\\c": ":"}


class LoiStomp(Exception):
    """Lỗi giao thức hoặc frame ERROR từ broker (thông điệp không chứa mật khẩu)."""


def thoat(s):
    """Escape giá trị header theo STOMP 1.2 (trừ frame CONNECT)."""
    return "".join(_THOAT.get(c, c) for c in str(s))


def bo_thoat(s):
    ra, i = [], 0
    while i < len(s):
        if s[i] == "\\":
            cap = s[i:i + 2]
            if cap not in _BO_THOAT:
                raise LoiStomp(f"escape không hợp lệ trong header: {cap!r}")
            ra.append(_BO_THOAT[cap])
            i += 2
        else:
            ra.append(s[i])
            i += 1
    return "".join(ra)


def ma_hoa(lenh, headers=None, body=b""):
    """→ bytes của một frame. CONNECT không escape header (STOMP 1.2 §Value Encoding)."""
    if isinstance(body, str):
        body = body.encode()
    dong = [lenh]
    for k, v in (headers or {}).items():
        dong.append(f"{k}:{v}" if lenh == "CONNECT" else f"{thoat(k)}:{thoat(v)}")
    if body:
        dong.append(f"content-length:{len(body)}")
    return ("\n".join(dong) + "\n\n").encode() + body + NUL


class BoDoc:
    """Tách frame từ luồng byte (một frame có thể đến nhiều lần recv, nhiều frame một lần).
    Dòng trống giữa các frame là heart-beat, bỏ qua."""

    def __init__(self):
        self.dem = b""

    def nap(self, du_lieu):
        self.dem += du_lieu

    def lay(self):
        """→ (lệnh, headers, body) hoặc None nếu chưa đủ một frame."""
        self.dem = self.dem.lstrip(b"\r\n")
        het_dau = self.dem.find(b"\n\n")
        if het_dau < 0:
            return None
        dau = self.dem[:het_dau].decode().replace("\r\n", "\n").split("\n")
        lenh, headers = dau[0], {}
        for dong in dau[1:]:
            k, _, v = dong.partition(":")
            k, v = bo_thoat(k), bo_thoat(v)
            headers.setdefault(k, v)  # header lặp: giá trị đầu tiên thắng (STOMP 1.2)
        bat_dau = het_dau + 2
        if "content-length" in headers:
            ket_thuc = bat_dau + int(headers["content-length"])
            if len(self.dem) < ket_thuc + 1:
                return None
            if self.dem[ket_thuc:ket_thuc + 1] != NUL:
                raise LoiStomp("frame không kết thúc bằng NUL sau content-length")
        else:
            ket_thuc = self.dem.find(NUL, bat_dau)
            if ket_thuc < 0:
                return None
        body = self.dem[bat_dau:ket_thuc]
        self.dem = self.dem[ket_thuc + 1:]
        return lenh, headers, body


class KetNoi:
    """Một kết nối STOMP tới RabbitMQ. Không an toàn đa luồng: mỗi luồng một kết nối."""

    def __init__(self, host, port, login, passcode, vhost, timeout=10):
        self.sock = socket.create_connection((host, port), timeout=timeout)
        self.doc = BoDoc()
        self._so_receipt = 0
        self.gui("CONNECT", {"accept-version": "1.2", "host": vhost, "login": login,
                             "passcode": passcode, "heart-beat": "0,0"})
        lenh, h, body = self.nhan()
        if lenh != "CONNECTED":
            raise LoiStomp(f"không kết nối được: {h.get('message', lenh)}")

    def gui(self, lenh, headers=None, body=b""):
        self.sock.sendall(ma_hoa(lenh, headers, body))

    def nhan(self, timeout=None):
        """→ frame kế tiếp; hết thời gian chờ → socket.timeout; frame ERROR → LoiStomp."""
        if timeout is not None:
            self.sock.settimeout(timeout)
        while True:
            frame = self.doc.lay()
            if frame:
                if frame[0] == "ERROR":
                    raise LoiStomp(f"broker trả ERROR: {frame[1].get('message', '')} "
                                   f"{frame[2][:200].decode(errors='replace')}".strip())
                return frame
            du_lieu = self.sock.recv(65536)
            if not du_lieu:
                raise LoiStomp("broker đóng kết nối")
            self.doc.nap(du_lieu)

    def phat(self, dich, body, headers=None, timeout=10):
        """SEND bền vững và chờ RECEIPT (broker đã nhận). Lỗi → LoiStomp hoặc socket.timeout."""
        self._so_receipt += 1
        ma = f"r-{self._so_receipt}"
        self.gui("SEND", {"destination": dich, "persistent": "true", "receipt": ma, **(headers or {})}, body)
        lenh, h, _ = self.nhan(timeout)
        if lenh != "RECEIPT" or h.get("receipt-id") != ma:
            raise LoiStomp(f"chờ RECEIPT {ma}, nhận {lenh}")

    def dang_ky(self, dich, prefetch=10, ma="0"):
        self.gui("SUBSCRIBE", {"id": ma, "destination": dich, "ack": "client-individual",
                               "prefetch-count": str(prefetch)})

    def ack(self, ma_ack):
        self.gui("ACK", {"id": ma_ack})

    def nack(self, ma_ack, requeue=False):
        self.gui("NACK", {"id": ma_ack, "requeue": "true" if requeue else "false"})

    def dong(self):
        try:
            self.gui("DISCONNECT")
        except OSError:
            pass
        try:
            self.sock.close()
        except OSError:
            pass
