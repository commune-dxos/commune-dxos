#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Lint từng thành phần (#11). `make lint` chạy tất cả; CI chạy từng phần trong một job riêng
# cùng tên, nên lỗi ở máy và ở CI giống nhau:
#   - phần shellcheck: mọi *.sh trong git hoặc chưa add (trừ .gitignore), theo cả tệp `source` (-x)
#   - phần yamllint: compose, APISIX, workflow CI… theo .yamllint.yml, cảnh báo cũng tính là lỗi
#   - phần bpmn: cấu trúc BPMN của mọi gói thu-tuc/*/quy-trinh.bpmn20.xml (scripts/check-bpmn.py) + test của chính bộ kiểm
#   - phần reuse: `reuse lint` – mọi tệp có bản quyền và giấy phép theo đặc tả REUSE 3.3 (header SPDX hoặc REUSE.toml),
#     giấy phép dùng tới có toàn văn trong LICENSES/ (#104; make check chỉ kiểm header của tệp mã)
# Dùng: scripts/lint.sh [shellcheck|yamllint|bpmn|reuse]...   (không tham số = tất cả)
# Thiếu công cụ → in cách cài và thoát mã 1 (không bỏ qua trong im lặng).
set -euo pipefail
cd "$(dirname "$0")/.."

CAI_DAT="cài: python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements-lint.txt
      rồi chạy lại với PATH=\"\$PWD/.venv/bin:\$PATH\" (hoặc brew/apt install shellcheck yamllint reuse)"

can() { # can <lệnh>: có lệnh thì in phiên bản, không thì hướng dẫn cài
  if ! command -v "$1" > /dev/null 2>&1; then
    echo "LỖI: chưa có '$1' trên máy — $CAI_DAT" >&2
    return 1
  fi
}

lint_shellcheck() {
  can shellcheck
  shellcheck --version | sed -n 's/^version: /shellcheck /p'
  git ls-files -z -co --exclude-standard '*.sh' | xargs -0 shellcheck -x
  echo "OK: shellcheck $(git ls-files -co --exclude-standard '*.sh' | wc -l | tr -d ' ') tệp .sh"
}

lint_yamllint() {
  can yamllint
  yamllint --version
  git ls-files -z -co --exclude-standard '*.yml' '*.yaml' | xargs -0 yamllint --strict -c .yamllint.yml
  echo "OK: yamllint $(git ls-files -co --exclude-standard '*.yml' '*.yaml' | wc -l | tr -d ' ') tệp YAML"
}

lint_bpmn() {
  can python3
  python3 scripts/check-bpmn.py
  PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/tests -p 'test_*.py'
}

lint_reuse() {
  can reuse
  reuse --version | head -1
  reuse lint
}

[ $# -gt 0 ] || set -- shellcheck yamllint bpmn reuse
for phan in "$@"; do
  case "$phan" in
    shellcheck|yamllint|bpmn|reuse) echo "== $phan"; "lint_$phan" ;;
    *) echo "Không biết phần '$phan' (shellcheck|yamllint|bpmn|reuse)" >&2; exit 2 ;;
  esac
done
