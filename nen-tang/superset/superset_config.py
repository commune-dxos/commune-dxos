# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Cấu hình Superset của nền tảng (#82), nạp qua SUPERSET_CONFIG_PATH. Không chứa nghiệp vụ: dashboard,
vai trò được xem gì do dịch vụ Tầng 2 dựng (mot-cua/bao-cao/, superset-init chạy lúc khởi tạo).

- Metadata: CSDL riêng `superset` trong PostgreSQL của lõi (db-init tạo role + CSDL, mật khẩu ở OpenBao).
- Bí mật (SECRET_KEY, mật khẩu CSDL) đọc từ tệp do agent superset-secrets render từ OpenBao, không có
  trong biến môi trường hay git.
- Không Redis, không Celery: cache metadata trong bộ nhớ tiến trình, không cache kết quả truy vấn, không
  chạy báo cáo/alert theo lịch.
- Chạy dưới tiền tố /bao-cao của APISIX (SUPERSET_APP_ROOT), sau proxy (ENABLE_PROXY_FIX).
- Giao diện (#144): logo, liên kết logo, màu chính lấy từ biến môi trường do dịch vụ Tầng 2 khai (không có
  nhận diện riêng ở Tầng 1); số theo kiểu Việt (dấu phẩy thập phân, dấu chấm hàng nghìn), tên tháng tiếng Việt.
  Superset không có bản dịch tiếng Việt: nhãn giao diện của Superset ("All", "Inv", "… minutes ago") vẫn là
  tiếng Anh.
- Đăng nhập chỉ bằng SSO Keycloak realm dxos (OAuth2 Authorization Code + PKCE, client public
  DXOS_SUPERSET_CLIENT): trình duyệt đi tới Keycloak ở DXOS_KEYCLOAK_URL (công khai), Superset đổi code
  lấy token qua mạng nội bộ (DXOS_KEYCLOAK_NOI_BO). Vai trò Superset theo client role của dxos_api trong
  access token, ánh xạ bằng DXOS_SUPERSET_VAI_TRO (JSON {"vai_keycloak": ["Vai Superset"]}); người không
  có vai nào được ánh xạ chỉ nhận vai Public (không quyền gì). Không có đăng nhập bằng mật khẩu Superset.
"""

import base64
import json
import os

from flask_appbuilder.security.manager import AUTH_OAUTH
from superset.security import SupersetSecurityManager

BI_MAT = os.environ.get("DXOS_SUPERSET_SECRETS_DIR", "/run/dxos-secrets")


def _doc(ten):
    with open(os.path.join(BI_MAT, ten), encoding="utf-8") as f:
        return f.read().strip()


SECRET_KEY = _doc("secret_key")
SQLALCHEMY_DATABASE_URI = (
    f"postgresql+psycopg2://superset:{_doc('db_password')}@"
    f"{os.environ.get('DXOS_SUPERSET_DB_HOST', 'postgres')}:5432/{os.environ.get('DXOS_SUPERSET_DB', 'superset')}"
)

# Một máy, không Redis: cache trong tiến trình (một worker gunicorn, nhiều luồng, để trạng thái bộ lọc
# nhất quán). Không cache kết quả truy vấn: bảng mart nhỏ, và dashboard phải thấy số liệu mới ngay sau
# make kho-du-lieu.
CACHE_CONFIG = {"CACHE_TYPE": "SimpleCache", "CACHE_DEFAULT_TIMEOUT": 300}
DATA_CACHE_CONFIG = {"CACHE_TYPE": "NullCache"}
FILTER_STATE_CACHE_CONFIG = CACHE_CONFIG
EXPLORE_FORM_DATA_CACHE_CONFIG = CACHE_CONFIG
ROW_LIMIT = 10000
FEATURE_FLAGS = {"ALERT_REPORTS": False, "DASHBOARD_RBAC": True}

ENABLE_PROXY_FIX = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
# Chỉ dùng HTTP trên máy dev; triển khai thật (HTTPS) đặt DXOS_SUPERSET_COOKIE_SECURE=true.
SESSION_COOKIE_SECURE = os.environ.get("DXOS_SUPERSET_COOKIE_SECURE", "false") == "true"
BABEL_DEFAULT_LOCALE = "en"
APP_NAME = os.environ.get("DXOS_SUPERSET_TEN", "Báo cáo")

# Logo và liên kết logo (#144). Superset 6.1 thêm tiền tố SUPERSET_APP_ROOT (/bao-cao) hai lần: superset/app.py
# thêm cho đường dẫn bắt đầu bằng "/static/" (và liên kết "/"), rồi giao diện thêm lần nữa → /bao-cao/bao-cao/…,
# logo mặc định vỡ ảnh. Né bằng cấu hình, không sửa mã: logo "/./static/…" (máy chủ bỏ qua, giao diện thêm một
# lần, trình duyệt rút "/./" thành "/"), liên kết "/superset/welcome/". Tầng 2 mount logo của mình vào thư mục tĩnh
# của Superset (chỉ đọc, docker-compose.yml) và khai DXOS_SUPERSET_LOGO; không khai thì dùng logo Superset.
APP_ICON = os.environ.get("DXOS_SUPERSET_LOGO") or "/./static/assets/images/superset-logo-horiz.png"
LOGO_TARGET_PATH = os.environ.get("DXOS_SUPERSET_LOGO_LINK") or "/superset/welcome/"
LOGO_TOOLTIP = APP_NAME
MAU_CHINH = os.environ.get("DXOS_SUPERSET_MAU_CHINH", "#2893B3")
# Toàn bộ token theme mặc định của Superset 6.1 (superset/config.py), chỉ đổi phần nhận diện. Viết lại đủ
# thay vì import superset.config: tệp này được nạp từ giữa superset.config.
THEME_DEFAULT = {
    "token": {
        "brandAppName": APP_NAME,
        "brandLogoAlt": APP_NAME,
        "brandLogoUrl": APP_ICON,
        "brandLogoMargin": "14px 0",
        "brandLogoHref": LOGO_TARGET_PATH,
        "brandLogoHeight": "32px",
        "brandSpinnerUrl": None,
        "brandSpinnerSvg": None,
        "colorPrimary": MAU_CHINH,
        "colorLink": MAU_CHINH,
        "colorError": "#e04355",
        "colorWarning": "#fcc700",
        "colorSuccess": "#5ac189",
        "colorInfo": "#66bcfe",
        "fontUrls": [],
        "fontFamily": "Inter, Helvetica, Arial, sans-serif",
        "fontFamilyCode": "'IBM Plex Mono', 'Courier New', monospace",
        "transitionTiming": 0.3,
        "brandIconMaxWidth": 37,
        "fontSizeXS": "8",
        "fontSizeXXL": "28",
        "fontWeightNormal": "400",
        "fontWeightLight": "300",
        "fontWeightStrong": "500",
        "fontWeightBold": "700",
        "colorEditorSelection": "#fff5cf",
    },
    "algorithm": "default",
}

# CSP tối thiểu: chỉ tài nguyên của chính Superset. Bản mặc định cho phép ảnh từ apachesuperset.gateway.scarf.sh
# (giao diện 6.1 luôn chèn một ảnh theo dõi lượt dùng, không có khóa tắt) và các máy chủ bản đồ mà báo cáo không
# dùng; bỏ đi thì trình duyệt chặn ảnh theo dõi, không gửi gì ra ngoài.
TALISMAN_ENABLED = True
TALISMAN_CONFIG = {
    "content_security_policy": {
        "base-uri": ["'self'"],
        "default-src": ["'self'"],
        "img-src": ["'self'", "blob:", "data:"],
        "worker-src": ["'self'", "blob:"],
        "connect-src": ["'self'"],
        "object-src": "'none'",
        "style-src": ["'self'", "'unsafe-inline'"],
        "font-src": ["'self'"],
        "script-src": ["'self'", "'strict-dynamic'"],
    },
    "content_security_policy_nonce_in": ["script-src"],
    "force_https": False,
    "session_cookie_secure": SESSION_COOKIE_SECURE,
}

# Số và ngày kiểu Việt cho mọi biểu đồ (d3-format/d3-time-format): 18,4%, 1.234, tháng 10/2026.
D3_FORMAT = {"decimal": ",", "thousands": ".", "grouping": [3], "currency": ["", " ₫"]}
D3_TIME_FORMAT = {
    "dateTime": "%A, %d/%m/%Y %X", "date": "%d/%m/%Y", "time": "%H:%M:%S", "periods": ["SA", "CH"],
    "days": ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"],
    "shortDays": ["CN", "T2", "T3", "T4", "T5", "T6", "T7"],
    "months": [f"tháng {i}" for i in range(1, 13)],
    "shortMonths": [f"Th{i}" for i in range(1, 13)],
}

KEYCLOAK = os.environ.get("DXOS_KEYCLOAK_URL", "http://localhost:8080").rstrip("/")
KEYCLOAK_NOI_BO = os.environ.get("DXOS_KEYCLOAK_NOI_BO", "http://keycloak:8080").rstrip("/")
REALM = os.environ.get("DXOS_KEYCLOAK_REALM", "dxos")
CLIENT_DXOS = os.environ.get("DXOS_JWT_ROLE_CLIENT", "dxos_api")

AUTH_TYPE = AUTH_OAUTH
OAUTH_PROVIDERS = [{
    "name": "keycloak",
    "icon": "fa-key",
    "token_key": "access_token",
    "remote_app": {
        "client_id": os.environ.get("DXOS_SUPERSET_CLIENT", "bao_cao_superset"),
        "client_secret": None,
        "authorize_url": f"{KEYCLOAK}/realms/{REALM}/protocol/openid-connect/auth",
        "access_token_url": f"{KEYCLOAK_NOI_BO}/realms/{REALM}/protocol/openid-connect/token",
        "api_base_url": f"{KEYCLOAK_NOI_BO}/realms/{REALM}/protocol/openid-connect/",
        # Không xin scope openid: không cần id_token (issuer trong token theo địa chỉ công khai, khác
        # địa chỉ nội bộ Superset gọi). Client public: không secret, bắt PKCE S256.
        "client_kwargs": {"scope": "profile email", "code_challenge_method": "S256",
                          "token_endpoint_auth_method": "none"},
    },
}]
AUTH_USER_REGISTRATION = True
AUTH_USER_REGISTRATION_ROLE = "Public"
AUTH_ROLES_SYNC_AT_LOGIN = True
AUTH_ROLES_MAPPING = json.loads(os.environ.get("DXOS_SUPERSET_VAI_TRO", "{}"))


class QuanLyBaoMat(SupersetSecurityManager):
    """Thông tin người dùng từ access token Keycloak. Token nhận thẳng từ token endpoint qua mạng nội
    bộ (không đi qua trình duyệt) nên chỉ cần đọc phần payload."""

    def oauth_user_info(self, provider, response=None):
        if provider != "keycloak" or not response:
            return {}
        p64 = response["access_token"].split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(p64 + "=" * (-len(p64) % 4)))
        vai = ((claims.get("resource_access") or {}).get(CLIENT_DXOS) or {}).get("roles") or []
        return {
            "username": claims.get("preferred_username") or claims["sub"],
            "first_name": claims.get("given_name") or "",
            "last_name": claims.get("family_name") or "",
            # Superset cần email duy nhất; người dùng mẫu có email, tài khoản thiếu thì dùng sub.
            "email": claims.get("email") or f"{claims['sub']}@nguoi-dung.invalid",
            "role_keys": vai,
        }


CUSTOM_SECURITY_MANAGER = QuanLyBaoMat
