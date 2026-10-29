# How we work and how to contribute

*Bản tiếng Việt: [Hướng dẫn đóng góp](../dong-gop.md), [Quy trình làm việc](../quy-trinh-lam-viec.md).*

## Branches

| Branch | Purpose |
|---|---|
| `main` | releases only (`v0.1.0` … `v1.0.0`); receives a PR from `develop` at release time |
| `develop` | daily integration; `make check` must always pass |
| `feature/<issue>-<short-name>` | one issue, branched from `develop` |

`main` and `develop` are protected: pull request required, one approving review, required CI checks, branch up to date, no force-push.

## One piece of work: issue → branch → pull request

1. **Issue.** Every line of the [plan](../PLAN.md) is an issue, created from the "Việc trong tuần" (weekly task) or "Thủ tục mới" (new procedure) template, with the week's milestone and a component label (`nen-tang`, `mot-cua`, `thu-tuc`, `docs`, `ci`).
2. **Branch** from the latest `develop`: `git switch -c feature/123-short-name`.
3. **Commit** small, one idea per commit, with your own GitHub account.
4. **Pull request** to `develop` using the template (`Closes #<issue>`), reviewed by another member, merged by squash.

## Commit messages

Conventional Commits, description in Vietnamese, issue number at the end:

```text
<type>(<scope>): <short description> (#<issue>)
feat(thu-tuc): gói xác nhận thông tin về cư trú (XNCT01) (#123)
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `ci`, `chore`, `build`, `perf`. The `CHANGELOG.md` and release notes are generated from commits with git-cliff, so the changelog is never edited by hand. The `quy-uoc-commit` workflow checks pull-request titles.

## Before opening a pull request

Run locally exactly what CI runs:

| Command | CI job | Checks |
|---|---|---|
| `make check` | `make-check` | SPDX header in every file, procedure packages, BPMN, open data in sync, unit tests, compose files for every profile |
| `make lint` | `shellcheck`, `yamllint`, `bpmn`, `reuse` | shell scripts, YAML, BPMN structure, REUSE 3.3 compliance |
| `make test` | `test-backend`, `test-sql` | backend unit tests; migrations + SQL/RLS tests on an empty PostgreSQL |
| `make tai-lieu` | `tai-lieu` | documentation site builds with `--strict` |

```bash
python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements-lint.txt -r docs/requirements.txt
PATH="$PWD/.venv/bin:$PATH" make lint tai-lieu
make check test
```

If the change touches `docker-compose.yml`, `nen-tang/`, `mot-cua/` or `thu-tuc/`, also run `make up` and `make smoke` on empty volumes.

## Licence, secrets, data

- The project is **GPL-3.0-or-later** (v0.0.1–v0.2.0 were Apache-2.0). Contributions are accepted under the same licence; no CLA. Every code and configuration file starts with `SPDX-FileCopyrightText: 2026 DTU_DZ_2` and `SPDX-License-Identifier: GPL-3.0-or-later` (`make license` adds them); files that cannot hold a comment are declared in `REUSE.toml`.
- Only OSI-approved, GPL-3.0-compatible components; AGPL/GPL-2.0 services run separately from upstream images. Adding or upgrading one means updating [`DEPENDENCIES.md`](../../DEPENDENCIES.md) and [`NOTICE`](../../NOTICE) in the same PR. No vendored or patched third-party code.
- Never commit `.env`, passwords, tokens or private keys; secrets live in OpenBao. All sample data is fake: never real identity papers or ID numbers.

## Where things are tracked

| What | Where |
|---|---|
| Weekly milestones | <https://github.com/commune-dxos/commune-dxos/milestones> |
| Project board | <https://github.com/orgs/commune-dxos/projects/1> |
| Bugs and proposals | <https://github.com/commune-dxos/commune-dxos/issues> |
| Releases | <https://github.com/commune-dxos/commune-dxos/releases> |
| Code of conduct | [`CODE_OF_CONDUCT.md`](../../CODE_OF_CONDUCT.md) |
