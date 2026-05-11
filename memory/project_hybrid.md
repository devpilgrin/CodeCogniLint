---
name: HybridCodeAnalysis — старт проекта
description: Контекст и состояние гибридной системы анализа кода (LLM+Git)
type: project
---

Проект инициализирован 2026-05-11. Полный стек: React+Vite+TS (frontend/), FastAPI+Python (backend/).

**Why:** Веб-IDE для анализа кода, объединяющий Git-историю с LLM-семантикой. Правила синтаксиса/семантики/анализа создаются прямо из редактора.

**Текущее состояние:**
- Frontend: `frontend/` — React, Tailwind v4 (@tailwindcss/vite), Monaco Editor, FontAwesome. Dev на :3000, прокси /api → :8000.
- Backend: `backend/` — FastAPI, LM Studio (localhost:1234/v1) как первый LLM-провайдер. Роутеры: /api/rules, /api/analysis, /api/settings.
- Правила хранятся в `backend/.hybrid-rules.json`.
- Первый LLM-провайдер: LM Studio (локальный, OpenAI-совместимый API).

**How to apply:** При работе над этим проектом помни: LM Studio — первый провайдер, файл правил — `.hybrid-rules.json` в папке backend.
