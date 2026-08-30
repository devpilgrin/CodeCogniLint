# CodeCogniLint

[![CI](https://github.com/devpilgrin/CodeCogniLint/actions/workflows/ci.yml/badge.svg)](https://github.com/devpilgrin/CodeCogniLint/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/devpilgrin/CodeCogniLint)](https://github.com/devpilgrin/CodeCogniLint/releases)
[![License](https://img.shields.io/github/license/devpilgrin/CodeCogniLint)](LICENSE)

**Languages:** [Русский](README.md) | **English**

A hybrid code analysis system for the web: Git-history statistics + LLM semantic understanding. An IDE-like interface with the Monaco editor, dynamic rules, and support for both cloud and local models.

![CodeCogniLint interface screenshot](image/scren.png)


## Features

- **IDE interface** — Monaco Editor, file tabs, explorer tree, AI panel, status bar
- **Project opening** — a local folder or Git-repository cloning right from the UI; recent projects list
- **Git loop** — saving edits to disk (Ctrl+S), Git panel: branch status, change list, commit / push / pull, commit history; push over HTTPS with a token (never persisted to config) or over SSH
- **Code review agent** — a specialized LLM reviewer: verdict (approved / comments / changes requested), issues with categories (bug / security / performance / style / maintainability) anchored to lines, code strengths; modes: current file and uncommitted changes (git)
- **Security scan (SAST/SCA)** — deterministic layer: Semgrep with vendored rules (CWE/OWASP metadata, offline), secret detection (gitleaks or built-in regex), dependency vulnerabilities (pip-audit / npm audit); optional second pass — an LLM verifier confirms/refutes findings
- **Analysis discipline** — suppression comments `# ccl:ignore [rule]` and `# ccl:ignore-file`, finding baseline/diff between scans (new / fixed), coverage metrics (how many files were actually analyzed), SARIF 2.1.0 export for GitHub Code Scanning; security gate in CI (semgrep --error + pip-audit)
- **Pentest loop (DAST)** — live application checks by URL: security headers, CORS (Origin reflection, `*`+credentials), TRACE, exposed .env/.git/docs; API fuzzing via OpenAPI (schemathesis, junit report parsing); nuclei when available; optional LLM interpretation (risk level + prioritized recommendations)
- **Multi-agent audit** — findings are grouped into domains (injection / authentication & secrets / cryptography / configuration / dependencies), each reviewed by its own sub-agent with an expert prompt and code context; a synthesizer delivers the final verdict with attack vectors and priorities; risk matrix CWE × severity × exploitability; HTML report export
- **Code quality** — performance (semgrep patterns: sync calls in async, glob in a loop, index-as-key…), size (LOC, function length, cyclomatic complexity via radon), best practices; hotspot rating + optional LLM review of the top 3
- **Watch mode** — automatic rescan on file changes: SSE stream, debounce over save bursts, deterministic layers without LLM
- **PR/MR integration** — creating GitHub PRs and GitLab MRs straight from the Git panel (push + host API), LLM-generated title/description from the diff
- **CI gates** — pytest (44 tests), semgrep security gate, pip-audit without exceptions, ratchet quality gate driven by `.ccl-quality.yml`, SARIF upload to GitHub Code Scanning
- **LLM benchmark** — a golden verification set of findings (TP/FP with traps), accuracy/P/R/F1 metrics per model
- **Docker** — one container = UI + API (multi-stage build)
- **File analysis** — LLM finds violations; Monaco highlights lines with squiggle markers and hover descriptions
- **Whole-project analysis** — streaming walk over SSE, real-time progress, file size/count limits
- **Accurate line numbers** — two-layer defense: line-number prefixes in the prompt + `code_snippet` lookup in the real file for correction
- **Dynamic rules** — create from selected code via LLM or manually through a form; enable/disable, edit, delete
- **LLM chat** — a separate tab; the active file context is mixed in automatically; history normalization for strict jinja templates
- **Multi-LLM** — LM Studio (local), OpenAI, Anthropic; settings are saved to `.env`
- **UI localization** — Russian, English, Chinese, Spanish (selector in Settings)


## Tech stack

| Layer      | Technologies                                     |
| - |  |
| Frontend   | React 19, TypeScript, Vite, Tailwind CSS v4      |
| Editor     | Monaco Editor (`@monaco-editor/react`)           |
| Backend    | Python 3.11+, FastAPI, Uvicorn                   |
| LLM client | OpenAI SDK (compatible with LM Studio, OpenAI, …) |
| Git        | GitPython (status/diff/commit/push/pull/clone)   |
| SAST/SCA   | Semgrep (vendored rules), gitleaks (optional), pip-audit, npm audit |
| DAST       | Schemathesis (OpenAPI fuzzing), nuclei (optional) |
| Quality    | radon (cyclomatic complexity), Semgrep patterns  |
| Streaming  | Server-Sent Events (`StreamingResponse`)         |
| Tests      | pytest + FastAPI TestClient                      |
| Packaging  | Docker (multi-stage), docker-compose             |


## Quick start

### Option 0: Docker (everything in one container)

```bash
docker build -t codecognilint .
docker run -p 8000:8000 codecognilint
# UI and API: http://localhost:8000
```

Or `docker compose up` (LLM variables via env, see `docker-compose.yml`).

### Option 1: one command (dev)

### Linux / macOS

```bash
# Start both services (dependencies are installed automatically on first run)
./start-all.sh

# Or one by one:
./start-backend.sh    # http://localhost:8000  (API + Swagger at /docs)
./start-frontend.sh   # http://localhost:3000
```

### Windows

```powershell
# 1. Install dependencies manually (once, or trust the scripts)
cd frontend
npm install
cd ..\backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt

# 2. Start both services in separate windows
.\start-all.bat

# Or one by one:
.\start-backend.bat   # http://localhost:8000
.\start-frontend.bat  # http://localhost:3000
```

Open <http://localhost:3000>.


## LLM configuration

By default, **LM Studio** at `http://localhost:1234/v1` is used:

1. Open LM Studio → **Developer** tab
2. Load a model (e.g. `qwen2.5-coder-7b`, `llama-3.1-8b-instruct`)
3. Click **Start Server**

Provider/model can be changed in the UI: left sidebar → gear icon. Changes are saved to `backend/.env`.

The `backend/.env.example` file (copied automatically on first run):

```env
LLM_PROVIDER=lmstudio
LLM_BASE_URL=http://localhost:1234/v1
LLM_MODEL=local-model
LLM_API_KEY=lm-studio
# LLM temperature (some models accept only 1.0):
# LLM_TEMPERATURE=0.3

# For cloud providers:
# OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...

# Token for git push/pull/PR over HTTPS (GitHub PAT / GitLab token; not needed for SSH remotes):
# GIT_TOKEN=ghp_...
```


## Usage

### Opening a project

Open the picker from the explorer header (or from the empty state). Three sources are available:

- **Local folder** — enter the path manually or use "Browse…" (server-side directory navigator)
- **Git repository** — cloned into `backend/projects/<name>` (shallow clone, `depth=1`)
- **Recent** — the last 8 projects

### Analysis

- **Header → "Analyze project"** — SSE walk over the whole workspace; 🤖N badges appear on explorer files as progress advances
- **Floating button (magic wand)** — analysis of the current file only
- Results accumulate in `resultsByFile` (per-path) — switching between tabs does not lose violations

### Rules

Three categories: **Syntax** (style), **Semantic** (logic), **Analysis** (security / tech debt / Git history).

**Create from selected code (LLM):**
Right-click the selection in the editor → choose a category → the LLM generates `description` and `pattern_description`.

**Create manually (no LLM):**
Left panel → Rules → "New rule" button. A form with per-category examples, validation, and an enabled toggle.

**Editing:** rule card → "Edit".
**Enable/disable:** click the status button `● ACTIVE` / `○ OFF` (optimistic update with rollback on error).

Rules are stored in `backend/.hybrid-rules.json`.

### AI insights

The right panel is split into tabs:

| Tab            | Content                                                       |
| -- |  |
| **File**       | Violation cards with jump-to-line and an "Ask LLM about the fix" button |
| **Review**     | Code review agent: verdict, line-anchored issues, strengths (file / git changes) |
| **Chat**       | LLM dialog (active file context), error messages, input field |


## API

The backend runs at `http://localhost:8000`, Swagger at `/docs`.

| Method | Path                              | Purpose                                   |
| -- |  | -- |
| GET   | `/api/health`                     | Health check                              |
| GET   | `/api/workspace`                  | Current project + recent list             |
| POST  | `/api/workspace/open`             | Open a local path                         |
| POST  | `/api/workspace/clone`            | Clone a Git repository                    |
| POST  | `/api/workspace/close`            | Close the current project                 |
| GET   | `/api/workspace/tree`             | File tree (skips `.git`, `node_modules`, …) |
| GET   | `/api/workspace/file?path=...`    | File content (path-traversal protected)   |
| PUT   | `/api/workspace/file`             | Save file to disk (atomic write)          |
| GET   | `/api/workspace/browse?path=...`  | Server-side directory picker              |
| GET   | `/api/git/status`                 | Branch, ahead/behind, change list         |
| GET   | `/api/git/diff?path=...`          | Unified diff (file or whole project)      |
| POST  | `/api/git/commit`                 | Commit (all changes or selected paths)    |
| POST  | `/api/git/push`                   | Push to origin (token from request or .env) |
| POST  | `/api/git/pull`                   | git pull --ff-only                        |
| POST  | `/api/git/pr`                     | Create a PR (GitHub) or MR (GitLab): push + API, optional LLM description |
| GET   | `/api/git/log?limit=...`          | Recent commits                            |
| POST  | `/api/review/file`                | Code review agent: review one file        |
| POST  | `/api/review/changes`             | Review uncommitted changes (git)          |
| GET   | `/api/security/tools`             | Engine availability (semgrep/gitleaks/…)  |
| POST  | `/api/security/scan?verify=`      | Security scan: SAST + secrets + SCA (+LLM verification) |
| POST  | `/api/security/sarif`             | SARIF 2.1.0 export of a scan              |
| GET/POST/DELETE | `/api/security/baseline` | Finding baseline: info / save / delete    |
| GET   | `/api/pentest/tools`              | DAST tool availability                    |
| POST  | `/api/pentest/scan`               | Pentest a live application (config/fuzz/nuclei + LLM interpretation) |
| POST  | `/api/audit/run?verify=`          | Multi-agent audit (sub-agents + synthesizer + matrix) |
| POST  | `/api/audit/html`                 | HTML rendering of the JSON audit report   |
| POST  | `/api/review/commit`            | Commit review (git show diff + LLM) |
| GET   | `/api/git/branches`             | Local workspace branches |
| GET   | `/api/analysis/compare`         | Violation diff between branches (semgrep-diff) |
| GET   | `/api/quality/tools`            | Quality engine availability (semgrep/radon) |
| GET   | `/api/watch/stream`               | Watch: SSE auto-rescans on file changes   |
| POST  | `/api/quality/scan?review=`       | Quality: performance + size + best practices |
| GET   | `/api/rules`                      | All rules                                 |
| POST  | `/api/rules`                      | Create manually (no LLM)                  |
| POST  | `/api/rules/generate`             | Generate from a code fragment (LLM)       |
| PATCH | `/api/rules/{id}`                 | Update a rule (incl. `enabled`)           |
| DELETE| `/api/rules/{id}`                 | Delete                                    |
| POST  | `/api/analysis/file`              | Analyze one file                          |
| GET   | `/api/analysis/repository/stream` | SSE: whole-project analysis               |
| POST  | `/api/analysis/chat`              | LLM chat (with history normalization)     |
| GET   | `/api/settings`                   | Current LLM settings                      |
| PUT   | `/api/settings`                   | Update settings (validation + atomic `.env` write) |


## Development and testing

```bash
cd backend
pip install -r requirements-dev.txt
python -m pytest tests/ -q          # unit + smoke (44 tests)

python quality_gate.py ..           # ratchet quality gate (budgets from ../.ccl-quality.yml)
python sarif_export.py .. out.sarif # full security scan → SARIF

# LLM benchmark (requires a provider key in env):
python benchmark/run_benchmark.py                    # all models from models.yml
python benchmark/run_benchmark.py --models kimi-k3   # selective
```

Contribution rules, pre-PR gates, and the release process — in [CONTRIBUTING.md](CONTRIBUTING.en.md).


## Project structure

```
CodeCogniLint/
├── backend/
│   ├── main.py                       # FastAPI app, CORS, routers, security headers, Allow on 405, static serving
│   ├── requirements.txt / -dev.txt   # prod dependencies / pytest
│   ├── .env(.example)                # LLM settings
│   ├── .hybrid-rules.json            # rules storage
│   ├── quality_gate.py               # ratchet quality gate CLI (CI)
│   ├── sarif_export.py               # CLI: full scan → SARIF (CI → Code Scanning)
│   ├── projects/                     # git repos are cloned here
│   ├── routers/
│   │   ├── analysis.py               # /file, /repository/stream, /chat
│   │   ├── rules.py                  # rules CRUD + /generate (LLM)
│   │   ├── workspace.py              # open/clone/tree/file/browse + file saving
│   │   ├── gitops.py                 # /git: status/diff/commit/push/pull/log/pr
│   │   ├── review.py                 # /review: code review agent (file, changes)
│   │   ├── security.py               # /security: tools + scan + sarif + baseline
│   │   ├── pentest.py                # /pentest: DAST by URL (config/fuzz/nuclei)
│   │   ├── audit.py                  # /audit: multi-agent audit + HTML
│   │   ├── quality.py                # /quality: performance/size/practices
│   │   ├── watch.py                  # /watch/stream: SSE auto-rescans
│   │   └── settings.py               # LLM settings: validation + atomic .env write
│   ├── security/
│   │   └── semgrep-rules.yml         # vendored rules with CWE/OWASP (offline)
│   ├── quality/
│   │   └── quality-rules.yml         # performance + best practices (offline)
│   ├── benchmark/
│   │   ├── verification_set.json     # verification golden set (TP/FP with traps)
│   │   ├── models.yml                # models to benchmark (keys via env)
│   │   ├── run_benchmark.py          # runner: accuracy/P/R/F1 + latency
│   │   └── results/                  # JSON run reports
│   ├── tests/                        # pytest: unit (services) + smoke (API)
│   └── services/
│       ├── llm_adapter.py            # LLMError + friendly error mapping, LLM_TEMPERATURE
│       ├── analysis_service.py       # prompt building, snippet-based line correction
│       ├── review_agent.py           # code review agent: verdict, issues, positives
│       ├── security_service.py       # semgrep/gitleaks/pip-audit + verifier + baseline/sarif + SCA cache
│       ├── pentest_service.py        # DAST: config checks, schemathesis, nuclei, LLM interpretation
│       ├── audit_agent.py            # audit orchestrator: domains, sub-agents, synthesizer
│       ├── quality_service.py        # quality: rules, LOC/CC metrics, hotspots, gate config
│       ├── watch_service.py          # watch: mtime snapshot, delta, rescan over SSE
│       ├── rules_service.py          # load/save/add/update/delete
│       ├── git_service.py            # GitPython + PR/MR (GitHub/GitLab API), token in URL only for the call duration
│       └── workspace_service.py      # tree walk, reading, writing, git clone
│
├── frontend/
│   ├── vite.config.ts                # /api → :8000 proxy
│   └── src/
│       ├── App.tsx                   # composition, tabs, jump-to-line, dialogs
│       ├── i18n/                     # UI localization (ru/en/zh/es): provider + dictionaries
│       │   ├── index.tsx             # I18nProvider, useI18n, t() with interpolation
│       │   └── locales/              # ru.ts / en.ts / zh.ts / es.ts
│       ├── components/
│       │   ├── Header.tsx
│       │   ├── ActivityBar.tsx
│       │   ├── Sidebar.tsx           # explorer / git / security / rules / settings
│       │   ├── GitPanel.tsx          # branch status, changes, commit/push/pull, history
│       │   ├── SecurityPanel.tsx     # security scan + pentest + audit (switcher)
│       │   ├── PentestView.tsx       # DAST: target, layers, risk, recommendations
│       │   ├── AuditView.tsx         # audit: domains, synthesis, risk matrix, HTML export
│       │   ├── QualityPanel.tsx      # quality: metrics, hotspots, findings
│       │   ├── ReviewTab.tsx         # code review agent: verdict, issues, positives
│       │   ├── EditorPane.tsx        # Monaco + context menu + markers
│       │   ├── AIPanel.tsx           # tabs: scope + Review + Chat
│       │   ├── FileTree.tsx          # recursive tree
│       │   ├── WorkspacePicker.tsx   # local / git clone / recent
│       │   ├── RuleCreatorDialog.tsx # from selection (LLM)
│       │   ├── ManualRuleDialog.tsx  # manual / editing
│       │   ├── AnalysisOverlay.tsx
│       │   └── StatusBar.tsx
│       ├── hooks/
│       │   ├── useRules.ts
│       │   ├── useAnalysis.ts        # single file + SSE repo
│       │   ├── useGit.ts             # status/commit/push/pull/PR + notifications
│       │   ├── useReview.ts          # code review agent (file / changes)
│       │   ├── useSecurity.ts        # security scan + baseline + watch (SSE)
│       │   ├── usePentest.ts         # DAST target scan by URL
│       │   ├── useAudit.ts           # multi-agent audit + HTML export
│       │   ├── useQuality.ts         # quality: scan + tools
│       │   └── useWorkspace.ts
│       ├── services/api.ts           # axios clients
│       └── types/index.ts
│
├── .ccl-quality.yml                  # ratchet quality gate budgets (CI)
├── Dockerfile                        # multi-stage: frontend build → backend + statics
├── docker-compose.yml                # optional (LLM via env)
├── .dockerignore
├── CONTRIBUTING.md                   # environment, pre-PR gates, principles, release process
├── start-all.sh / .bat               # start both services (Linux/macOS / Windows)
├── start-backend.sh / .bat
├── start-frontend.sh / .bat
└── claude.md                         # original spec
```


## Architectural decisions

- **Accurate line numbers** — the LLM receives code with a `   N |` prefix for every line + must return `code_snippet`; the backend looks up the snippet in the source and rewrites `line_start`/`line_end`. On multiple matches, the closest to the LLM's guess is chosen
- **LM Studio failure resilience** — `LLMError` with human-readable Russian descriptions for typical cases ("model not loaded", "unreachable at address", etc.); errors go to the Chat and never crash the process
- **Chat history normalization** — for strict jinja templates (Llama, Qwen), duplicate system messages, leading orphan-assistant messages, and consecutive same-role messages are merged away
- **SSE streaming** — `text/event-stream` with `X-Accel-Buffering: no`, auto-stop after 3 consecutive LLM errors
- **Path traversal** — `target.relative_to(root)` guarantees `/api/workspace/file` cannot read outside the workspace; binaries are cut on null bytes; 5 MB limit for the editor, 256 KB for batch analysis
- **Git push without token leakage** — the HTTPS token is injected into the URL only for the duration of the `git push <url>` call and is never stored in `.git/config`; after the push, the remote-tracking ref and upstream config are updated manually; credentials are masked as `***` in errors. SSH remotes (`git@...`) work natively via OS keys
- **Code review agent** — a dedicated reviewer "persona" prompt on top of `review_agent.py`: deterministic normalization of the LLM response (verdict, severity, categories are clamped to allowed values), reuse of snippet-based line-number correction; the `changes` mode takes changed files from git status and reviews each with diff context
- **Configurable LLM temperature** — `LLM_TEMPERATURE` in `.env` (default 0.3): some models (e.g. reasoning ones) accept only `temperature=1`
- **Deterministic security layer** — Semgrep with a vendored ruleset (`security/semgrep-rules.yml`, CWE/OWASP metadata, works offline without the registry); secrets — gitleaks when available, otherwise built-in regex; SCA — pip-audit for `requirements*.txt` and npm audit for `package-lock.json`. Each layer degrades independently (`status: unavailable` without failing the report)
- **LLM as verifier, not detector** — the top 10 findings (by severity) are confirmed/refuted by the LLM in a second pass with code context (`confirmed` / `false_positive` + rationale); the model never hunts for vulnerabilities itself — this eliminates hallucinations and misses
- **Suppression** — a `# ccl:ignore [rule_id|CWE]` comment on the finding's line or the line above suppresses it across all layers; `# ccl:ignore-file [rule]` in the first 5 lines suppresses the whole file; suppressed findings appear greyed out in the report, never reach SARIF, and are excluded from the baseline
- **Baseline/diff** — finding fingerprint = sha256(rule + path + title), survives line shifts; a scan with a saved baseline marks `NEW` findings and counts fixed ones
- **Security gate in CI** — semgrep with vendored rules fails the build on any finding; pip-audit on `requirements.txt` with no exceptions (dependencies are pinned to versions without known CVEs); npm audit — advisory only
- **DAST pentest** — built-in config checks (headers/CORS/TRACE/.env/.git) with zero dependencies; API fuzzing via schemathesis against `/openapi.json` with junit parsing; nuclei — feature-detected. Synchronous HTTP and CLI calls are moved to threads (`asyncio.to_thread`), otherwise self-scanning would block the event loop
- **Multi-agent audit** — LLMs operate only on top of deterministic findings: grouping by CWE/tool into domains, parallel sub-agents with expert prompts (`asyncio.gather`), a verifier-synthesizer; without findings, the LLM is never called
- **API hygiene** — security headers on all responses (middleware); error codes (400/404/409/503) documented globally in OpenAPI; `Allow` on 405 is rebuilt from routes (static paths take priority over `{param}`); StrictBool/pattern constraints in pydantic models; report sanitizers for invalid XML characters — our own pentest (schemathesis) was driven from 35 failures to 0 correctness defects
- **Atomic settings** — `PUT /settings` validates the entire set BEFORE writing; `.env` is rewritten via tmp+`os.replace`; in-memory settings are applied only after a successful write
- **Parallel layers and SCA cache** — independent tools (semgrep/secrets/SCA, quality rules+metrics) run concurrently (`asyncio.gather`+`to_thread`); SCA is cached by manifest sha256 (`.hybrid-sca-cache.json`), an unchanged rescan is ~40x faster; manifests are discovered recursively
- **Quality gate (ratchet)** — `.ccl-quality.yml`: metric thresholds + counter budgets (findings/complex/long/big); `backend/quality_gate.py` exits 1 on regression; `ccl:ignore`/`ccl:ignore-file` are respected; budgets are tightened as debt is paid down
- **Watch mode** — dependency-free mtime polling of code files, debounce over save bursts, rescan by deterministic layers (no LLM calls — no token burn), report over SSE
- **PR/MR loop** — the host is derived from the remote (GitHub/GitLab/self-hosted); push before creation; an existing PR/MR is returned instead of an error; LLM title/description generation from `diff --stat` and commits
- **Benchmark as ground truth** — the verifier is evaluated against a golden set with traps (AWS example key, placeholders, md5 outside a security context); a model that confirms by format rather than by meaning loses points
- **uvicorn `--reload-exclude`** — `projects/*` and `*.json` are excluded from the watcher so cloned repos and storage changes do not trigger restarts


## Status

**Implemented:**
- Single-file and whole-project analysis
- Rule creation/editing/deletion/toggling
- Local project opening and Git cloning
- Saving edits to disk (Ctrl+S, atomic write, "dirty" indicator)
- Git panel: branch status, changes, commit / push / pull, history
- Code review agent: verdict + line-anchored issues + strengths (file and git changes)
- Security scan: Semgrep (CWE/OWASP), secrets, vulnerable dependencies + LLM verification
- Suppression `# ccl:ignore` and `# ccl:ignore-file`, finding baseline/diff, coverage metrics, SARIF export (including upload to GitHub Code Scanning from CI)
- Pentest (DAST): config checks, API fuzzing via OpenAPI, LLM risk interpretation
- Multi-agent audit: domain sub-agents + synthesizer + risk matrix (CWE)
- API hygiene: security headers, documented response codes/types, fuzz resilience (own pentest: 35 → 0 correctness defects)
- PR integration: GitHub PR and GitLab MR creation from the UI (push + API, host from remote), LLM title/description generation from the diff
- Audit report HTML export (deterministic rendering)
- LLM settings: validation before write + atomic .env rewrite
- **Code quality** — a dedicated layer: semgrep performance and best-practice patterns (python/js/ts), size metrics (LOC, function length, cyclomatic complexity via radon), hotspot rating, optional LLM review of top hotspots
- **Test loop** — pytest: service unit tests (suppression/baseline/fingerprint, report sanitizers, settings validation, quality metrics) + endpoint smoke tests via TestClient; runs in CI
- **Quality gate in CI (ratchet)** — `.ccl-quality.yml` at the project root: metric thresholds + finding budgets; regression (counter above budget) fails the build; `ccl:ignore` respected
- **Scan performance** — parallel execution of independent layers (semgrep/secrets/SCA, quality rules+metrics); SCA cache by manifest hash (an unchanged rescan is ~40x faster); manifests discovered recursively (backend/requirements.txt, frontend/package-lock.json)
- **Docker distribution** — multi-stage image: frontend is built and served by FastAPI as statics; one container = UI + API; CONTRIBUTING.md for contributors
- **Watch mode** — auto-rescan on file changes: `/api/watch/stream` SSE stream (mtime polling, debounce, deterministic layers without LLM), toggle in the Security panel
- **LLM benchmark** — `backend/benchmark/`: golden verification set (16 TP/FP cases with traps), production prompt run per model from `models.yml`, accuracy/precision/recall/F1 + latency metrics; results in `benchmark/results/`
- Security gate in CI (semgrep + pip-audit, dependencies without known CVEs)
- LLM chat (with file context)
- Multi-LLM (LM Studio / OpenAI / Anthropic)
- UI localization: ru / en / zh / es

**In development:**
- Specific commit analysis (`git diff` + LLM comments)
- Violation comparison between branches
