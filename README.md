# CodeCogniLint

[![CI](https://github.com/devpilgrin/CodeCogniLint/actions/workflows/ci.yml/badge.svg)](https://github.com/devpilgrin/CodeCogniLint/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/devpilgrin/CodeCogniLint)](https://github.com/devpilgrin/CodeCogniLint/releases)
[![License](https://img.shields.io/github/license/devpilgrin/CodeCogniLint)](LICENSE)

Гибридная система анализа кода для веба: статистика Git-истории + семантическое понимание LLM. IDE-подобный интерфейс с редактором Monaco, динамическими правилами и поддержкой как облачных, так и локальных моделей.

![Скриншот интерфейса CodeCogniLint](image/scren.png)


## Возможности

- **IDE-интерфейс** — Monaco Editor, табы файлов, дерево проводника, AI-панель, status bar
- **Открытие проектов** — локальная папка или клонирование Git-репозитория прямо из UI; список недавних проектов
- **Git-контур** — сохранение правок на диск (Ctrl+S), панель Git: статус ветки, список изменений, commit / push / pull, история коммитов; push по HTTPS с токеном (не сохраняется в конфиг) или по SSH
- **Агент код-ревью** — специализированный LLM-ревьюер: вердикт (одобрено / комментарии / требуются правки), замечания с категориями (баг / безопасность / производительность / стиль / поддерживаемость) и привязкой к строкам, сильные стороны кода; режимы: текущий файл и незакоммиченные изменения (git)
- **Security-скан (SAST/SCA)** — детерминированный слой: Semgrep с вендоренными правилами (CWE/OWASP-метаданные, офлайн), поиск секретов (gitleaks или встроенные regex), уязвимости зависимостей (pip-audit / npm audit); опциональный второй проход — LLM-верификатор подтверждает/опровергает находки
- **Дисциплина анализа** — suppression-комментарии `# ccl:ignore [rule]`, baseline/diff находок между сканами (новые / исправленные), метрики покрытия (сколько файлов реально проанализировано), экспорт SARIF 2.1.0 для GitHub Code Scanning; security-gate в CI (semgrep --error + pip-audit)
- **Пентест-контур (DAST)** — проверки живого приложения по URL: security-заголовки, CORS (отражение Origin, `*`+credentials), TRACE, открытые .env/.git/docs; фаззинг API по OpenAPI (schemathesis, junit-парсинг отчёта); nuclei при наличии; опциональная LLM-интерпретация (уровень риска + приоритизированные рекомендации)
- **Мульти-агентный аудит** — находки группируются по доменам (инъекции / аутентификация и секреты / криптография / конфигурация / зависимости), каждый разбирает свой суб-агент с экспертным промптом и контекстом кода; синтезатор выносит итоговый вердикт с векторами атаки и приоритетами; матрица рисков CWE × тяжесть × эксплуатируемость; HTML-экспорт отчёта
- **Качество кода** — производительность (semgrep-паттерны: sync в async, glob в цикле, index-as-key…), размер (LOC, длина функций, цикломатическая сложность через radon), best practices; рейтинг hotspot'ов + опциональный LLM-разбор топ-3
- **Watch-режим** — авто-перескан при изменении файлов: SSE-поток, debounce на серию сохранений, детерминированные слои без LLM
- **PR/MR-интеграция** — создание GitHub PR и GitLab MR прямо из панели Git (push + API хоста), LLM-генерация заголовка/описания по diff
- **Гейты в CI** — pytest (44 теста), semgrep security-gate, pip-audit без исключений, ratchet quality-gate по `.ccl-quality.yml`, выгрузка SARIF в GitHub Code Scanning
- **Бенчмарк LLM** — эталонный набор верификации находок (TP/FP с ловушками), метрики accuracy/P/R/F1 по моделям
- **Docker** — один контейнер = UI + API (multi-stage сборка)
- **Анализ файла** — LLM находит нарушения, Monaco подсвечивает строки squiggle-маркерами с ховер-описанием
- **Анализ всего проекта** — потоковый обход через SSE, прогресс в реальном времени, лимиты на размер/количество файлов
- **Точные номера строк** — двухслойная защита: префикс номеров в промпте + поиск `code_snippet` в реальном файле для коррекции
- **Динамические правила** — создание из выделенного кода через LLM или вручную через форму; включение/отключение, редактирование, удаление
- **Чат с LLM** — отдельная вкладка, контекст активного файла подмешивается автоматически; нормализация истории для строгих jinja-шаблонов
- **Multi-LLM** — LM Studio (локально), OpenAI, Anthropic; настройки сохраняются в `.env`


## Стек

| Слой       | Технологии                                       |
| - |  |
| Frontend   | React 19, TypeScript, Vite, Tailwind CSS v4      |
| Редактор   | Monaco Editor (`@monaco-editor/react`)           |
| Backend    | Python 3.11+, FastAPI, Uvicorn                   |
| LLM-клиент | OpenAI SDK (совместим с LM Studio, OpenAI, …)    |
| Git        | GitPython (status/diff/commit/push/pull/clone)   |
| SAST/SCA   | Semgrep (вендоренные правила), gitleaks (опц.), pip-audit, npm audit |
| DAST       | Schemathesis (OpenAPI-фаззинг), nuclei (опц.)    |
| Качество   | radon (цикломатическая сложность), Semgrep-паттерны |
| Стриминг   | Server-Sent Events (`StreamingResponse`)         |
| Тесты      | pytest + FastAPI TestClient                      |
| Упаковка   | Docker (multi-stage), docker-compose             |


## Быстрый старт

### Вариант 0: Docker (всё в одном контейнере)

```bash
docker build -t codecognilint .
docker run -p 8000:8000 codecognilint
# UI и API: http://localhost:8000
```

Или `docker compose up` (переменные LLM — через env, см. `docker-compose.yml`).

### Вариант 1: одной командой (dev)

### Linux / macOS

```bash
# Запуск обоих сервисов (зависимости установятся автоматически при первом запуске)
./start-all.sh

# Или по одному:
./start-backend.sh    # http://localhost:8000  (API + Swagger на /docs)
./start-frontend.sh   # http://localhost:3000
```

### Windows

```powershell
# 1. Установить зависимости вручную (один раз, либо доверить скриптам)
cd frontend
npm install
cd ..\backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt

# 2. Запуск обоих сервисов в отдельных окнах
.\start-all.bat

# Или по одному:
.\start-backend.bat   # http://localhost:8000
.\start-frontend.bat  # http://localhost:3000
```

Откройте <http://localhost:3000>.


## Настройка LLM

По умолчанию используется **LM Studio** на `http://localhost:1234/v1`:

1. Откройте LM Studio → вкладка **Developer**
2. Загрузите модель (например, `qwen2.5-coder-7b`, `llama-3.1-8b-instruct`)
3. Нажмите **Start Server**

Сменить провайдера/модель можно в UI: левая боковая панель → значок шестерёнки. Изменения сохраняются в `backend/.env`.

Файл `backend/.env.example` (копируется автоматически при первом запуске):

```env
LLM_PROVIDER=lmstudio
LLM_BASE_URL=http://localhost:1234/v1
LLM_MODEL=local-model
LLM_API_KEY=lm-studio
# Температура LLM (некоторые модели принимают только 1.0):
# LLM_TEMPERATURE=0.3

# Для облачных провайдеров:
# OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...

# Токен для git push/pull/PR по HTTPS (GitHub PAT / GitLab token; для SSH-remote не нужен):
# GIT_TOKEN=ghp_...
```


## Использование

### Открытие проекта

В шапке проводника (или из пустого состояния) откройте пикер. Доступно три источника:

- **Локальная папка** — введите путь вручную или используйте «Обзор…» (серверный навигатор по дискам)
- **Git-репозиторий** — клонируется в `backend/projects/<имя>` (shallow clone, `depth=1`)
- **Недавние** — последние 8 проектов

### Анализ

- **Шапка → «Анализ проекта»** — SSE-обход всего workspace, бейджи 🤖N появляются на файлах в проводнике по мере прогресса
- **Floating-кнопка (волшебная палочка)** — анализ только текущего файла
- Результаты накапливаются в `resultsByFile` (per-path) — переключение между табами не теряет нарушения

### Правила

Три категории: **Синтаксис** (стиль), **Семантика** (логика), **Анализ** (безопасность / техдолг / Git-история).

**Создание из выделенного кода (LLM):**
ПКМ в редакторе по выделению → выбрать категорию → LLM генерирует `description` и `pattern_description`.

**Создание вручную (без LLM):**
Левая панель → Правила → кнопка «Новое правило». Форма с примерами для каждой категории, валидацией, переключателем активности.

**Редактирование:** карточка правила → «Изменить».
**Включение/отключение:** клик по кнопке статуса `● АКТИВНО` / `○ ОТКЛ.` (оптимистичный апдейт с откатом при ошибке).

Правила хранятся в `backend/.hybrid-rules.json`.

### AI-инсайты

Правая панель разделена на вкладки:

| Вкладка        | Содержимое                                                   |
| -- |  |
| **Файл**       | Карточки нарушений с переходом к строке, кнопкой «Спросить LLM об исправлении» |
| **Ревью**      | Агент код-ревью: вердикт, замечания по строкам, сильные стороны (файл / git-изменения) |
| **Чат**        | Диалог с LLM (контекст активного файла), сообщения об ошибках, поле ввода |


## API

Бэк работает на `http://localhost:8000`, Swagger — `/docs`.

| Метод | Путь                              | Назначение                                |
| -- |  | -- |
| GET   | `/api/health`                     | Health-check                              |
| GET   | `/api/workspace`                  | Текущий проект + список недавних          |
| POST  | `/api/workspace/open`             | Открыть локальный путь                    |
| POST  | `/api/workspace/clone`            | Клонировать Git-репозиторий               |
| POST  | `/api/workspace/close`            | Закрыть текущий проект                    |
| GET   | `/api/workspace/tree`             | Дерево файлов (skip `.git`, `node_modules`, …) |
| GET   | `/api/workspace/file?path=...`    | Контент файла (с защитой от path traversal) |
| PUT   | `/api/workspace/file`             | Сохранить файл на диск (атомарная запись) |
| GET   | `/api/workspace/browse?path=...`  | Серверный пикер директорий                |
| GET   | `/api/git/status`                 | Ветка, ahead/behind, список изменений     |
| GET   | `/api/git/diff?path=...`          | Unified diff (файл или весь проект)       |
| POST  | `/api/git/commit`                 | Коммит (все изменения или выбранные пути) |
| POST  | `/api/git/push`                   | Push в origin (токен из запроса или .env) |
| POST  | `/api/git/pull`                 | git pull --ff-only                        |
| POST  | `/api/git/pr`                   | Создать PR (GitHub) или MR (GitLab): push + API, LLM-описание опционально |
| GET   | `/api/git/log?limit=...`          | Последние коммиты                         |
| POST  | `/api/review/file`                | Агент код-ревью: ревью одного файла       |
| POST  | `/api/review/changes`             | Ревью незакоммиченных изменений (git)     |
| GET   | `/api/security/tools`             | Доступность движков (semgrep/gitleaks/…)  |
| POST  | `/api/security/scan?verify=`      | Security-скан: SAST + секреты + SCA (+LLM-верификация) |
| POST  | `/api/security/sarif`             | SARIF 2.1.0-экспорт скана                 |
| GET/POST/DELETE | `/api/security/baseline` | Baseline находок: инфо / сохранить / удалить |
| GET   | `/api/pentest/tools`              | Доступность DAST-инструментов             |
| POST  | `/api/pentest/scan`               | Пентест живого приложения (config/fuzz/nuclei + LLM-интерпретация) |
| POST  | `/api/audit/run?verify=`        | Мульти-агентный аудит (суб-агенты + синтезатор + матрица) |
| POST  | `/api/audit/html`               | HTML-рендер JSON-отчёта аудита |
| GET   | `/api/quality/tools`            | Доступность движков качества (semgrep/radon) |
| GET   | `/api/watch/stream`             | Watch: SSE авто-пересканов при изменении файлов |
| POST  | `/api/quality/scan?review=`     | Качество: производительность + размер + best practices |
| GET   | `/api/rules`                      | Все правила                               |
| POST  | `/api/rules`                      | Создать вручную (без LLM)                 |
| POST  | `/api/rules/generate`             | Сгенерировать из фрагмента кода (LLM)     |
| PATCH | `/api/rules/{id}`                 | Обновить правило (в т.ч. `enabled`)       |
| DELETE| `/api/rules/{id}`                 | Удалить                                   |
| POST  | `/api/analysis/file`              | Анализ одного файла                       |
| GET   | `/api/analysis/repository/stream` | SSE: анализ всего проекта                 |
| POST  | `/api/analysis/chat`              | Чат с LLM (с нормализацией истории)       |
| GET   | `/api/settings`                   | Текущие настройки LLM                     |
| PUT   | `/api/settings`                   | Обновить настройки (валидация + атомарная запись `.env`) |


## Разработка и тестирование

```bash
cd backend
pip install -r requirements-dev.txt
python -m pytest tests/ -q          # unit + smoke (44 теста)

python quality_gate.py ..           # ratchet-гейт качества (бюджеты из ../.ccl-quality.yml)
python sarif_export.py .. out.sarif # полный security-скан → SARIF

# Бенчмарк LLM (нужен ключ провайдера в env):
python benchmark/run_benchmark.py                    # все модели из models.yml
python benchmark/run_benchmark.py --models kimi-k3   # выборочно
```

Правила участия, гейты перед PR и релизный процесс — в [CONTRIBUTING.md](CONTRIBUTING.md).


## Структура проекта

```
CodeCogniLint/
├── backend/
│   ├── main.py                       # FastAPI app, CORS, роутеры, security-заголовки, Allow на 405, раздача static
│   ├── requirements.txt / -dev.txt   # prod-зависимости / pytest
│   ├── .env(.example)                # настройки LLM
│   ├── .hybrid-rules.json            # хранилище правил
│   ├── quality_gate.py               # CLI ratchet-гейта качества (CI)
│   ├── sarif_export.py               # CLI: полный скан → SARIF (CI → Code Scanning)
│   ├── projects/                     # сюда клонируются git-репо
│   ├── routers/
│   │   ├── analysis.py               # /file, /repository/stream, /chat
│   │   ├── rules.py                  # CRUD правил + /generate (LLM)
│   │   ├── workspace.py              # open/clone/tree/file/browse + сохранение файла
│   │   ├── gitops.py                 # /git: status/diff/commit/push/pull/log/pr
│   │   ├── review.py                 # /review: агент код-ревью (file, changes)
│   │   ├── security.py               # /security: tools + scan + sarif + baseline
│   │   ├── pentest.py                # /pentest: DAST по URL (config/fuzz/nuclei)
│   │   ├── audit.py                  # /audit: мульти-агентный аудит + HTML
│   │   ├── quality.py                # /quality: производительность/размер/практики
│   │   ├── watch.py                  # /watch/stream: SSE авто-пересканов
│   │   └── settings.py               # LLM-настройки: валидация + атомарная запись .env
│   ├── security/
│   │   └── semgrep-rules.yml         # вендоренные правила с CWE/OWASP (офлайн)
│   ├── quality/
│   │   └── quality-rules.yml         # производительность + best practices (офлайн)
│   ├── benchmark/
│   │   ├── verification_set.json     # эталон верификации (TP/FP с ловушками)
│   │   ├── models.yml                # модели для прогона (ключи через env)
│   │   ├── run_benchmark.py          # раннер: accuracy/P/R/F1 + латентность
│   │   └── results/                  # JSON-отчёты прогонов
│   ├── tests/                        # pytest: unit (сервисы) + smoke (API)
│   └── services/
│       ├── llm_adapter.py            # LLMError + friendly error mapping, LLM_TEMPERATURE
│       ├── analysis_service.py       # построение промпта, snippet-based коррекция строк
│       ├── review_agent.py           # агент код-ревью: вердикт, issues, positives
│       ├── security_service.py       # semgrep/gitleaks/pip-audit + верификатор + baseline/sarif + SCA-кэш
│       ├── pentest_service.py        # DAST: config-checks, schemathesis, nuclei, LLM-интерпретация
│       ├── audit_agent.py            # оркестратор аудита: домены, суб-агенты, синтезатор
│       ├── quality_service.py        # качество: правила, метрики LOC/CC, hotspots, гейт-конфиг
│       ├── watch_service.py          # watch: снапшот mtime, дельта, rescan по SSE
│       ├── rules_service.py          # load/save/add/update/delete
│       ├── git_service.py            # GitPython + PR/MR (GitHub/GitLab API), токен в URL только на время вызова
│       └── workspace_service.py      # обход дерева, чтение, запись, git clone
│
├── frontend/
│   ├── vite.config.ts                # прокси /api → :8000
│   └── src/
│       ├── App.tsx                   # композиция, табы, jump-to-line, диалоги
│       ├── components/
│       │   ├── Header.tsx
│       │   ├── ActivityBar.tsx
│       │   ├── Sidebar.tsx           # explorer / git / security / rules / settings
│       │   ├── GitPanel.tsx          # статус ветки, изменения, commit/push/pull, история
│       │   ├── SecurityPanel.tsx     # security-скан + пентест + аудит (переключатель)
│       │   ├── PentestView.tsx       # DAST: цель, слои, риск, рекомендации
│       │   ├── AuditView.tsx         # аудит: домены, синтез, матрица рисков, HTML-экспорт
│       │   ├── QualityPanel.tsx      # качество: метрики, hotspots, находки
│       │   ├── ReviewTab.tsx         # агент код-ревью: вердикт, issues, positives
│       │   ├── EditorPane.tsx        # Monaco + контекстное меню + маркеры
│       │   ├── AIPanel.tsx           # вкладки: scope + Ревью + Чат
│       │   ├── FileTree.tsx          # рекурсивное дерево
│       │   ├── WorkspacePicker.tsx   # local / git clone / recent
│       │   ├── RuleCreatorDialog.tsx # из выделения (LLM)
│       │   ├── ManualRuleDialog.tsx  # вручную / редактирование
│       │   ├── AnalysisOverlay.tsx
│       │   └── StatusBar.tsx
│       ├── hooks/
│       │   ├── useRules.ts
│       │   ├── useAnalysis.ts        # одиночный + SSE репо
│       │   ├── useGit.ts             # статус/commit/push/pull/PR + уведомления
│       │   ├── useReview.ts          # агент код-ревью (file / changes)
│       │   ├── useSecurity.ts        # security-скан + baseline + watch (SSE)
│       │   ├── usePentest.ts         # DAST-скан цели по URL
│       │   ├── useAudit.ts           # мульти-агентный аудит + HTML-экспорт
│       │   ├── useQuality.ts         # качество: скан + инструменты
│       │   └── useWorkspace.ts
│       ├── services/api.ts           # axios-клиенты
│       └── types/index.ts
│
├── .ccl-quality.yml                  # ratchet-бюджеты гейта качества (CI)
├── Dockerfile                        # multi-stage: frontend build → backend + статика
├── docker-compose.yml                # опционально (LLM через env)
├── .dockerignore
├── CONTRIBUTING.md                   # окружение, гейты перед PR, принципы, релизный процесс
├── start-all.sh / .bat                 # запуск обоих сервисов (Linux/macOS / Windows)
├── start-backend.sh / .bat
├── start-frontend.sh / .bat
└── claude.md                           # исходное ТЗ
```


## Архитектурные решения

- **Точность номеров строк** — LLM получает код с префиксом `   N |` для каждой строки + обязан возвращать `code_snippet`; бэк ищет snippet в исходнике и переписывает `line_start`/`line_end`. При множественных совпадениях выбирается ближайшее к гипотезе LLM
- **Защита от падений LM Studio** — `LLMError` с человекочитаемым русским описанием для типовых случаев («модель не загружена», «недоступен по адресу», и т.д.); ошибки попадают в Чат, не валят процесс
- **Нормализация истории чата** — для строгих jinja-шаблонов (Llama, Qwen) убираются дубль-system, orphan-assistant в начале, склеиваются подряд идущие сообщения одной роли
- **SSE-стриминг** — `text/event-stream` с `X-Accel-Buffering: no`, авто-стоп после 3 LLM-ошибок подряд
- **Path traversal** — `target.relative_to(root)` гарантирует, что `/api/workspace/file` не читает за пределами workspace; бинарники режутся по null-byte; лимит 5 МБ для редактора, 256 КБ для пакетного анализа
- **Git push без утечки токена** — HTTPS-токен подставляется в URL только на время вызова `git push <url>`, в `.git/config` не сохраняется; после push remote-tracking ref и upstream-конфиг обновляются вручную; в ошибках креды маскируются `***`. SSH-remote (`git@...`) работает нативно через ключи ОС
- **Агент код-ревью** — отдельный промпт-«личность» ревьюера поверх `review_agent.py`: детерминированная нормализация ответа LLM (вердикт, severity, категории обрезаются до допустимых значений), повторное использование snippet-based коррекции номеров строк; режим `changes` берёт изменённые файлы из git status и ревьюит каждый с diff-контекстом
- **Настраиваемая температура LLM** — `LLM_TEMPERATURE` в `.env` (по умолчанию 0.3): часть моделей (например, reasoning-модели) принимает только `temperature=1`
- **Детерминированный security-слой** — Semgrep с вендоренным набором правил (`security/semgrep-rules.yml`, CWE/OWASP-метаданные, работает офлайн без реестра); секреты — gitleaks при наличии, иначе встроенные regex; SCA — pip-audit по `requirements*.txt` и npm audit по `package-lock.json`. Каждый слой деградирует независимо (`status: unavailable` без падения отчёта)
- **LLM — верификатор, не детектор** — топ-10 находок (по severity) вторым проходом подтверждаются/опровергаются LLM с контекстом кода (`confirmed` / `false_positive` + обоснование); модель не ищет уязвимости сама — это устраняет галлюцинации и пропуски
- **Suppression** — комментарий `# ccl:ignore [rule_id|CWE]` на строке находки или строкой выше подавляет её во всех слоях; подавленные видны в отчёте серым, в SARIF не попадают, в baseline не сохраняются
- **Baseline/diff** — fingerprint находки = sha256(правило + путь + заголовок), переживает сдвиг строк; скан при сохранённом baseline помечает `NEW` и считает исправленные
- **Security-gate в CI** — semgrep с вендоренными правилами роняет сборку на любой находке; pip-audit по `requirements.txt` без исключений (зависимости держатся на версиях без известных CVE); npm audit — совещательно
- **DAST-пентест** — встроенные config-checks (заголовки/CORS/TRACE/.env/.git) без зависимостей; фаззинг API через schemathesis по `/openapi.json` с junit-парсингом; nuclei — feature-detect. Синхронные HTTP и CLI вынесены в потоки (`asyncio.to_thread`), иначе самосканирование блокирует event loop
- **Мульти-агентный аудит** — LLM работают только поверх детерминированных находок: группировка по CWE/инструменту в домены, параллельные суб-агенты с экспертными промптами (`asyncio.gather`), синтезатор-верификатор; без находок LLM не вызывается вовсе
- **API-гигиена** — security-заголовки на все ответы (middleware); коды ошибок (400/404/409/503) задокументированы глобально в OpenAPI; `Allow` на 405 пересобирается из маршрутов (статические пути в приоритете над `{param}`); StrictBool/pattern-ограничения в pydantic-моделях; санитайзеры отчётов от недопустимых XML-символов — собственный пентест (schemathesis) доведён с 35 сбоев до 0 дефектов корректности
- **Атомарные настройки** — `PUT /settings` валидирует весь набор ДО записи, `.env` переписывается через tmp+`os.replace`, in-memory применяется только после успешной записи
- **Параллельные слои и SCA-кэш** — независимые инструменты (semgrep/secrets/SCA, quality rules+metrics) запускаются конкурентно (`asyncio.gather`+`to_thread`); SCA кэшируется по sha256 манифестов (`.hybrid-sca-cache.json`), повторный скан без изменений ~40x быстрее; манифесты ищутся рекурсивно
- **Гейт качества (ratchet)** — `.ccl-quality.yml`: пороги метрик + бюджеты счётчиков (находки/сложные/длинные/большие); `backend/quality_gate.py` падает exit 1 при регрессе; `ccl:ignore`/`ccl:ignore-file` учитываются; бюджеты ужимаются по мере разбора долга
- **Watch-режим** — polling-снапшот mtime кодовых файлов (без зависимостей), debounce на серию сохранений, rescan детерминированными слоями (LLM не вызывается — токены не расходуются), отчёт по SSE
- **PR/MR-контур** — хост определяется по remote (GitHub/GitLab/self-hosted); push перед созданием; существующий PR/MR возвращается вместо ошибки; LLM-генерация заголовка/описания по `diff --stat` и коммитам
- **Бенчмарк как разметка истины** — верификатор оценивается на эталоне с ловушками (AWS example-ключ, плейсхолдеры, md5 вне security-контекста); модель, подтверждающая по формату, а не по смыслу, теряет баллы
- **uvicorn `--reload-exclude`** — `projects/*` и `*.json` исключены из watcher'а, чтобы клонированные репо и изменения хранилищ не дёргали перезапуск


## Статус

**Реализовано:**
- Анализ файла и всего проекта
- Создание/редактирование/удаление/переключение правил
- Открытие локального проекта и клонирование Git
- Сохранение правок на диск (Ctrl+S, атомарная запись, индикатор «dirty»)
- Git-панель: статус ветки, изменения, commit / push / pull, история
- Агент код-ревью: вердикт + замечания по строкам + сильные стороны (файл и git-изменения)
- Security-скан: Semgrep (CWE/OWASP), секреты, уязвимые зависимости + LLM-верификация
- Suppression `# ccl:ignore` и `# ccl:ignore-file`, baseline/diff находок, метрики покрытия, SARIF-экспорт (включая загрузку в GitHub Code Scanning из CI)
- Пентест (DAST): config-checks, фаззинг API по OpenAPI, LLM-интерпретация риска
- Мульти-агентный аудит: суб-агенты по доменам + синтезатор + матрица рисков (CWE)
- API-гигиена: security-заголовки, документированные коды/типы ответов, устойчивость к фаззингу (собственный пентест: 35 → 0 дефектов корректности)
- PR-интеграция: создание GitHub PR и GitLab MR из UI (push + API, хост по remote), LLM-генерация заголовка/описания по diff
- HTML-экспорт отчёта аудита (детерминированный рендер)
- Настройки LLM: валидация до записи + атомарная перезапись .env
- **Качество кода** — отдельный слой: semgrep-паттерны производительности и best practices (python/js/ts), метрики размера (LOC, длина функций, цикломатическая сложность через radon), рейтинг hotspot'ов, опциональный LLM-разбор топ-hotspot'ов
- **Тестовый контур** — pytest: unit-тесты сервисов (suppression/baseline/fingerprint, санитайзеры отчётов, валидация настроек, метрики качества) + smoke-эндпоинтов через TestClient; прогон в CI
- **Гейт качества в CI (ratchet)** — `.ccl-quality.yml` в корне проекта: пороги метрик + бюджеты находок; регресс (счётчик выше бюджета) роняет сборку; `ccl:ignore` учитывается
- **Производительность сканов** — параллельный запуск независимых слоёв (semgrep/secrets/SCA, quality rules+metrics); SCA-кэш по хешу манифестов (повторный скан без изменений ~40x быстрее); манифесты ищутся рекурсивно (backend/requirements.txt, frontend/package-lock.json)
- **Docker-дистрибуция** — multi-stage образ: frontend собирается и раздаётся FastAPI как статика; один контейнер = UI + API; CONTRIBUTING.md для участников
- **Watch-режим** — авто-перескан при изменении файлов: SSE-поток `/api/watch/stream` (polling mtime, debounce, детерминированные слои без LLM), переключатель в панели Безопасность
- **Бенчмарк LLM** — `backend/benchmark/`: эталонный набор верификации (16 кейсов TP/FP с ловушками), прогон боевого промпта по моделям из `models.yml`, метрики accuracy/precision/recall/F1 + латентность; результаты в `benchmark/results/`
- Security-gate в CI (semgrep + pip-audit, зависимости без известных CVE)
- Чат с LLM (с контекстом файла)
- Multi-LLM (LM Studio / OpenAI / Anthropic)

**В разработке:**
- Анализ конкретного коммита (`git diff` + LLM-комментарии)
- Сравнение нарушений между ветками
