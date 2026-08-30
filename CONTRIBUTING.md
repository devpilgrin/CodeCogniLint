# Участие в разработке CodeCogniLint

**Языки:** **Русский** | [English](CONTRIBUTING.en.md)

Спасибо за интерес к проекту. Этот документ — краткий путь от клона до PR.

## Окружение

- Python 3.11+ (разработка ведётся на 3.12), Node.js 20+, git.
- Опционально: semgrep, pip-audit, radon, schemathesis (ставятся из `backend/requirements.txt`), gitleaks, nuclei — детектируются автоматически, слои деградируют независимо.

## Запуск для разработки

```bash
# Backend (http://localhost:8000)
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend (http://localhost:5173, прокси на 8000)
cd frontend
npm ci
npm run dev
```

Либо одной командой из корня: `./start-all.sh` (Linux/macOS) или `start-all.bat` (Windows).

## Тесты и гейты (обязательны перед PR)

```bash
cd backend
pip install -r requirements-dev.txt
python -m pytest tests/ -q          # unit + smoke

python quality_gate.py ..           # ratchet-бюджеты качества
semgrep scan --config security/semgrep-rules.yml --error --metrics off . ../frontend/src
pip-audit -r requirements.txt --progress-spinner off

cd ../frontend && npm run lint && npm run build
```

CI повторяет всё это: backend (pytest, 3.11/3.12), frontend (lint+build, 20/22),
security-gate (semgrep + pip-audit), quality-gate (бюджеты из `.ccl-quality.yml`).

## Принципы проекта

- **Решения — детерминированный код, модели — исполнители рутины.** LLM
  верифицирует и интерпретирует находки детерминированных движков, но не
  ищет уязвимости сама и не принимает решений о маршрутизации.
- Каждый слой деградирует независимо: инструмента нет — слой отвечает
  `status: unavailable`, остальные работают.
- Suppression `# ccl:ignore [rule_id]` работает во всех скан-слоях.
- Runtime-state (`.hybrid-*.json`, `.env`, кэши) не коммитится.
- Семантика HTTP-кодов: 400 — доменная валидация, 404 — не найдено,
  409 — конфликт состояния (git-операции), 422 — схема, 503 — LLM недоступна.
  Коды задокументированы в OpenAPI — фаззер следит (см. пентест-контур).

## Стиль

- Backend: читаемость важнее краткости; сложность функций держим CC ≤ 10
  (гейт качества следит), длину ≤ 60 строк.
- Frontend: TypeScript строго, 0 ошибок eslint (warnings по hooks допустимы
  осознанно — см. `eslint.config.js`).
- Комментарии и сообщения пользователю — на русском.

## Релизный процесс (для мейнтейнеров)

1. Все гейты зелёные локально и в CI.
2. `git tag -a vX.Y.Z -m "..."` → `git push origin vX.Y.Z`.
3. Release workflow соберёт frontend, подставит версию и опубликует
   GitHub Release с tar.gz/zip.

Перед изменением бюджетов `.ccl-quality.yml`: улучшили код — уменьшайте
бюджеты в том же PR; увеличение бюджета требует обоснования в описании PR.
