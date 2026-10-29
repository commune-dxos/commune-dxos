# Quick start from a clean machine

*Bản tiếng Việt: [Cài đặt và chạy](../cai-dat.md).*

This page is enough to run Commune DX-OS from nothing. All data is fake sample data.

## 1. Requirements

| Item | Minimum | Notes |
|---|---|---|
| OS | Linux, macOS, Windows (WSL2) | amd64 or arm64: every image ships both |
| Docker | Docker Engine 24+ or Docker Desktop 4.25+ (OrbStack works) | |
| Docker Compose | v2.20+ (`docker compose version`) | bundled with Docker Desktop |
| Memory for Docker | 4 GB, 6 GB recommended | about 2.3 GB in use with the `core` profile |
| Free disk | 6 GB | images about 4.1 GB, volumes about 0.3 GB |
| Tools | `git`, `make`, `bash`, `curl`, `jq`, `python3` (3.10+) | used by `make smoke` and the tests |
| Network | about 1.1 GB download on first start | |

No Java, Node or PostgreSQL on the host: every service runs from its upstream image.

## 2. Run it

```bash
git clone https://github.com/commune-dxos/commune-dxos.git
cd commune-dxos
cp .env.example .env      # nothing to fill in: no password lives in .env
make up                   # core platform + one-stop-shop engine + procedure packages + web portal
make smoke                # end-to-end check, ends with "0 trượt" (0 failed)
make demo-users           # sets one password for the sample users and prints it
```

- The first `make up` takes 2–10 minutes, mostly image downloads; later starts take about 35 seconds. `make smoke` waits for services to be healthy, then runs about a thousand checks.
- `make up` initialises and unseals **OpenBao**, which generates every service secret and writes the unseal key and root token to `.data/openbao/commune.json` (mode 600, outside git). **Do not delete or commit this file**; back it up. Auto-unseal from a file is for development only (`BAO_UNSEAL=manual` in production).
- Run `make demo-users` **after** `make smoke`: smoke sets random passwords for the sample users.
- Stop: `make down` (keeps data). Wipe everything: `docker compose --profile '*' down -v`, then delete `.data/openbao/commune.json`.

## 3. Open it

| What | Address | Login |
|---|---|---|
| Citizen portal | <http://localhost:9080/> | `congdan01` (browsing needs no login) |
| Progress lookup | <http://localhost:9080/tra-cuu> | none: application code + last 4 phone digits |
| Q&A assistant | <http://localhost:9080/hoi-dap> | none |
| Staff portal | <http://localhost:9080/can-bo> | `canbo01` (civil status), `canbo02` (certification), `canbo03` (land), `lanhdao01` (leader), `vanthu01` (clerk); password + OTP, scan the QR code on first login |
| Public API | <http://localhost:9080/public/thu_tuc> | none, 60 requests/minute |
| Keycloak account page | <http://localhost:8080/realms/dxos/account> | set up OTP here |

Every call goes through the APISIX gateway on port 9080. The password for all sample users is the one `make demo-users` printed.

Get a citizen token and call the API:

```bash
PW='<password from make demo-users>'
TOKEN=$(curl -s http://localhost:8080/realms/dxos/protocol/openid-connect/token \
  -d grant_type=password -d client_id=dxos_cli -d username=congdan01 -d password="$PW" | jq -r .access_token)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:9080/api/ho_so | jq          # only congdan01's applications
curl -s 'http://localhost:9080/public/rpc/json_schema_thu_tuc?ma=KS01' | jq            # required documents of KS01
```

## 4. Optional profiles

| Command | Adds | Extra resources |
|---|---|---|
| `make up-bi` | Superset dashboard at `/bao-cao/` (leader, SSO). Run `make kho-du-lieu` to fill the history store | image about 1.3 GB |
| `make up-ocr` | OCR service (PaddleOCR PP-OCRv5 + VietOCR on ONNX Runtime) for "read from photo" and officer confirmation | about 450 MB image, 0.5 GB RAM |
| `make up-ai` with `LLM_PROVIDER=ollama` in `.env` | Ollama with Qwen2.5 7B + bge-m3 for the Q&A assistant | about 6.5 GB RAM, 13 GB disk |

Without a model (`LLM_PROVIDER=tat`, the default) the assistant still returns the most relevant cited passages. Details: [Cài đặt §4](../cai-dat.md#4-cấu-hình-trước-khi-chạy).

## 5. Configuration

All settings live in `.env` (copied from `.env.example`, every variable commented) and are read by `make up`. Common ones: `APISIX_PORT` / `KEYCLOAK_PORT` (9080 / 8080), `DXOS_SEED` (`false` in production), `BAO_UNSEAL` (`file` or `manual`), `LLM_PROVIDER`. After editing `.env`, run `make up` again.

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| `port is already allocated` (8080, 9080, 55432, 8090) | change `KEYCLOAK_PORT`, `APISIX_PORT`, `POSTGRES_PORT`, `FLOWABLE_PORT` in `.env`, then `make up` |
| after a reboot services stay down, `make bao-status` says `Sealed true` | normal: OpenBao seals on restart. Run `make up` |
| `bao-init: thiếu /bao-init/commune.json` | `.data/openbao/commune.json` is lost: restore your backup, or wipe with `docker compose --profile '*' down -v` and `make up` |
| containers `OOMKilled`, Keycloak or Flowable restarting | give Docker at least 6 GB |
| `make smoke` fails on `clamav healthy` | first start downloads the virus database (about 250 MB); wait 1–2 minutes and rerun |
| `/public/…` returns 429 right after `make smoke` | smoke deliberately uses up the 60/minute limit; wait one minute |
| `Account is not fully set up` when getting an officer token | log in once on the Keycloak account page and set up OTP |

More cases: [Cài đặt §7](../cai-dat.md#7-xử-lý-lỗi-thường-gặp).

## 7. Tests

```bash
make check    # SPDX headers, procedure packages, BPMN, open data, unit tests, compose files (no Docker needed except compose config)
make lint     # shellcheck, yamllint, BPMN, reuse lint, as in CI
make test     # backend unit tests + SQL/RLS tests on a throw-away PostgreSQL
make smoke    # end-to-end on the running system
```
