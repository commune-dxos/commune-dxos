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
