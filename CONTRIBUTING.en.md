# Contributing to CodeCogniLint

**Languages:** [Русский](CONTRIBUTING.md) | **English**

Thank you for your interest in the project. This document is a short path from clone to PR.

## Environment

- Python 3.11+ (development targets 3.12), Node.js 20+, git.
- Optional tools enhance the scan: `semgrep`, `gitleaks`, `pip-audit`, `radon`, `schemathesis`. They are installed with backend dependencies; gitleaks is optional (feature-detected — the system degrades gracefully).

## Run locally

```bash
./start-all.sh          # Linux/macOS: backend :8000 + frontend :3000
# or Windows: start-all.bat
```

## Gates before a PR (all must be green)

```bash
cd backend
pip install -r requirements-dev.txt
python -m pytest tests/ -q       # unit + smoke
python quality_gate.py ..        # ratchet quality gate (budgets from .ccl-quality.yml)
cd ../frontend && npm run lint && npm run build
```

CI additionally runs the security gate (semgrep + pip-audit) and uploads SARIF to GitHub Code Scanning.

## Project principles

- **Decisions — deterministic code, models — routine executors.** LLM only verifies/interprets the findings of deterministic engines; it never searches on its own.
- A new endpoint — OpenAPI-disciplined codes (400/404/409/503) and tests for both the happy path and the errors.
- The ratchet budgets in `.ccl-quality.yml` may only be tightened. If a new feature pushes a counter over the budget — either suppress deliberately (`# ccl:ignore` with a comment) or lower the budget after paying down debt.
- Runtime state never goes into git: `.env`, `.hybrid-workspace.json`, `backend/projects/`, caches. `backend/.hybrid-rules.json` IS tracked — do not delete or revert it.
- UI strings go through i18n: `useI18n()` → `t('area.key')`, dictionaries in `frontend/src/i18n/locales/` (ru/en/zh/es). New keys must be added to all four dictionaries.

## Style

- Backend: Python 3.11+, type hints, Russian docstrings.
- Frontend: React 19 + TypeScript; no new dependencies without discussion.
- Commits: a meaningful first line in Russian + details below; feat/fix/docs/refactor/test prefixes are welcome.

## Release process

Releases are cut by the maintainer: a `v*` tag → CI/CD builds and publishes the bundle. Version is tracked in tags only.
