# Architecture overview

*Bản tiếng Việt, đầy đủ chi tiết: [Kiến trúc tổng thể](../architecture.md).*

## Three layers, three folders

![Two-tier architecture: Tier 2 mot-cua with the citizen portal, staff portal, mot-cua-api, mot-cua-worker and procedure packages plugged into a shared engine; Tier 1 nen-tang with Keycloak, APISIX, PostgREST, PostgreSQL, ClamAV, Garage, Flowable, RabbitMQ, OpenBao](../images/kien-truc-2-tang.webp)

| Folder | Layer | Contains | Never contains |
|---|---|---|---|
| `nen-tang/` | Tier 1, headless core | SSO, API gateway, databases, object storage, workflow engine, secrets, queue, search, signing CA, PDF rendering, virus scanning. API only | business tables, roles or procedures |
| `mot-cua/` | Tier 2, one-stop-shop engine | the schema and row-level security shared by every procedure, the workflow and file APIs, the event worker, the React portals | anything specific to one procedure |
| `thu-tuc/<code>/` | procedure package | one procedure: description, hand-written BPMN, required documents as JSON Schema, fake sample data | code |

At commune level what changes all the time is the list of administrative procedures (hundreds of them, each with its own workflow, papers and deadline), while intake, permissions, deadline tracking, storage and events stay the same. So the plug-in unit is the **procedure package**: a loader checks each folder and deploys it, and Tier 2 talks to Tier 1 **only through the APISIX gateway**.

## The four services the contest requires

| Requirement (Tier 1) | Component | In the repository |
|---|---|---|
| Identity / SSO | Keycloak 26, realm `dxos`; OTP mandatory for officers and leaders | `nen-tang/keycloak/`, `mot-cua/keycloak/` |
| API gateway | Apache APISIX 3.13 standalone: JWT check, rate limit on the public API, CORS, Flowable admin API blocked; routes `/public`, `/api`, `/workflow`, `/files`, `/` | `nen-tang/apisix/` |
| Structured and unstructured data | PostgreSQL 17 with row-level security + PostgREST; pgAudit; hash-chained audit log. Garage (S3) for files, scanned by ClamAV **before** storage, served by short-lived signed links; Meilisearch CE and pgvector for search | `nen-tang/postgres/`, `nen-tang/garage/`, `mot-cua/db/` |
| Workflow engine | Flowable REST 8.0.0, BPMN 2.0 written by hand inside each package, deployed by the `nap-thu-tuc` loader | `thu-tuc/*/quy-trinh.bpmn20.xml`, `mot-cua/backend/` |

Supporting services: OpenBao (every secret; one AppRole and least-privilege policy per service), RabbitMQ (application events through a PostgreSQL outbox), step-ca + pyHanko + Gotenberg (signed PDF receipts, results and outgoing documents), Superset + Parquet/DuckDB/dbt (reporting with lineage), Ollama + Qwen2.5 7B + bge-m3 and PaddleOCR + VietOCR (optional AI profile). Every component is OSI-licensed and runs from its upstream image; AGPL/GPL services (Garage, ClamAV) run as separate, unmodified services. Full list: [`DEPENDENCIES.md`](../../DEPENDENCIES.md).

## How a request is authorised

The browser logs in with Keycloak (OIDC + PKCE, plus OTP for staff) and calls the gateway with the access token. APISIX verifies the JWT against Keycloak's keys; PostgREST verifies it again and switches to the PostgreSQL role named in the token (`cong_dan`, `can_bo`, `lanh_dao`, `van_thu`). Row-level security then decides which rows that person may see: a citizen only their own applications, an officer only applications of the fields assigned to them. The thin `mot-cua-api` service checks the same token before it touches Flowable, Garage or the signing CA, none of which is reachable from outside.

## Life of an application

1. The citizen creates the application (`POST /api/ho_so`); the database assigns a code and a deadline in working days.
2. Each document is uploaded to `/files`: size limit at the gateway, type check by magic bytes, ClamAV scan, then Garage.
3. `POST /workflow/ho-so/{id}/khoi-tao` validates the scanned documents against the package's JSON Schema (missing → 422, nothing started), starts the BPMN process and issues a signed PDF receipt.
4. Officers and the leader complete BPMN steps from the staff portal; each step's inputs are the `formProperty` fields declared in the package. The application status follows the open step, and every change writes a status-history row, an outbox event and an audit-log entry in one transaction.
5. A worker publishes events to RabbitMQ and raises `ho_so.sap_tre_han` when one working day remains; officers see it in their portal over server-sent events.
6. When the process ends, a signed result notice is issued; closed applications are exported, de-identified, to Parquet for the dashboard.

Diagrams and route tables: [Kiến trúc §4](../architecture.md#4-luồng-xác-thực-jwt-keycloak--apisix--postgrest--rls) and [§4.9](../architecture.md#49-luồng-hồ-sơ-một-cửa-từ-nộp-tới-trả-kết-quả-82).

## H-P-D-I spaces in the Tier 2 application

| Space | Features |
|---|---|
| [H] Human | citizen portal, staff portal with SSO + OTP, internal document wiki |
| [P] Process | online application with two-layer Poka-yoke (browser and server, same JSON Schema), BPMN steps, deadline alerts, signed receipts and results, incoming/outgoing document register with digital signatures |
| [D] Data | verifiable hash-chained audit log, Parquet + DuckDB history store, dbt lineage, Superset dashboard of processing time and late rate |
| [I] Intelligence | OCR of identity papers and birth certificates with officer confirmation (human in the loop); procedure Q&A assistant (RAG) that must cite its sources |

Contest requirement mapping (Vietnamese): [Đối chiếu yêu cầu đề thi](../de-thi-mapping.md).
