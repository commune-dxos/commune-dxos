#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Lint từng thành phần (#11). `make lint` chạy tất cả; CI chạy từng phần trong một job riêng
# cùng tên, nên lỗi ở máy và ở CI giống nhau:
#   - phần shellcheck: mọi *.sh trong git hoặc chưa add (trừ .gitignore), theo cả tệp `source` (-x)
#   - phần yamllint: compose, APISIX, workflow CI… theo .yamllint.yml, cảnh báo cũng tính là lỗi
#   - phần bpmn: cấu trúc BPMN của apps/*/processes (scripts/check-bpmn.py) + test của chính bộ kiểm
# Dùng: scripts/lint.sh [shellcheck|yamllint|bpmn]...   (không tham số = tất cả)
# Thiếu công cụ → in cách cài và thoát mã 1 (không bỏ qua trong im lặng).
set -euo pipefail
cd "$(dirname "$0")/.."

CAI_DAT="cài: python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements-lint.txt
      rồi chạy lại với PATH=\"\$PWD/.venv/bin:\$PATH\" (hoặc brew/apt install shellcheck yamllint)"

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

[ $# -gt 0 ] || set -- shellcheck yamllint bpmn
for phan in "$@"; do
  case "$phan" in
    shellcheck|yamllint|bpmn) echo "== $phan"; "lint_$phan" ;;
    *) echo "Không biết phần '$phan' (shellcheck|yamllint|bpmn)" >&2; exit 2 ;;
  esac
done
