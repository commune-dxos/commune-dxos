# Commune DX-OS documentation (English)

*Bản tiếng Việt: [Trang chủ](../index.md).*

**Commune DX-OS** is an open-source (GPL-3.0-or-later) digital-government operating system for Vietnamese communes, the lowest level of local government. A headless core (Tier 1: single sign-on, API gateway, structured and unstructured data, workflow engine) runs a one-stop-shop engine (Tier 2) that handles every administrative procedure. Each procedure is a **package** in `thu-tuc/<code>/`; adding a procedure means adding a folder, not changing code.

Built by team DTU_DZ_2 for the OLP PMNM 2026 open-source contest (topic: DX-OS Open-Core).

## The problem it solves

| Before | After |
|---|---|
| Citizens travel to the commune office again and again just to ask whether their application is done. | Apply online, upload documents, track progress with the application code and the last 4 digits of a phone number, download a digitally signed receipt and result. |
| One missing paper sends the citizen home for another trip. | Each procedure declares its required documents as a JSON Schema; the portal and the server both refuse an incomplete application (Poka-yoke). |
| Paper files move between desks and get lost. | Every application has a code, a status driven by the BPMN workflow, a step history and an append-only, hash-chained audit log. |
| Deadlines are counted by hand. | Deadlines are computed in working days (weekends and public holidays skipped); officers get a near-deadline alert in their portal in real time. |
| Anyone can open the shared register. | Officers only see applications of their own field (PostgreSQL row-level security) and must log in with a one-time password. Uploads are virus-scanned before storage. |
| A new procedure waits for a software change. | Drop a `thu-tuc/<code>/` folder and run `make nap-thu-tuc`. |
| Leaders count late files at the end of the month. | Superset dashboard of processing time and late rate, fed by a Parquet + DuckDB + dbt history store with lineage. |
| Officers retype every line of a citizen's papers. | OCR reads the photo and pre-fills the form; an officer confirms (human in the loop). A Q&A assistant answers procedure questions with cited sources. |

## What runs today

| User | Where | What |
|---|---|---|
| Citizen | `http://localhost:9080/` | procedure catalogue, online application with document checks, progress lookup, "my applications", supplementary uploads, Q&A assistant at `/hoi-dap` |
| One-stop-shop and specialist officers | `http://localhost:9080/can-bo` | SSO + OTP, task inbox by field, application detail, BPMN step forms, near-deadline notifications, incoming/outgoing document register with digital signatures, internal document wiki |
| Commune leader | `/can-bo`, `/bao-cao/` | approvals and signing, audit-log verification, Superset dashboard |
| Developer | `thu-tuc/<code>/` | add a procedure without touching the engine |

Supported procedures: birth registration (KS01), certified copies (CT01), marriage registration (KH01), land-dispute mediation (DD01). The generated [procedure catalogue](../danh-muc-thu-tuc.md) is in Vietnamese, because the procedures are Vietnamese law.

## Where to go next

| You are | Read |
|---|---|
| Trying it on your machine | [Quick start](quick-start.md) |
| A developer adding a procedure | [Worked example A to Z](../thu-tuc.md#ví-dụ-từ-a-đến-z-gói-xác-nhận-thông-tin-về-cư-trú) (bilingual) |
| Studying the design | [Architecture overview](architecture.md) |
| Contributing | [How we work](contributing.md) |

The Vietnamese pages are the full reference; these English pages cover every main section and link to the Vietnamese detail where needed.
