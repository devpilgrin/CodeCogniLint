# CodeCogniLint — единый контейнер: frontend build → backend + статика.
# Сборка:  docker build -t codecognilint .
# Запуск:  docker run -p 8000:8000 codecognilint
# UI и API: http://localhost:8000  (OpenAPI: /docs)

# ---------- Stage 1: frontend ----------
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---------- Stage 2: backend + статика ----------
FROM python:3.12-slim AS runtime
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app/backend

# git нужен git-контуру (status/commit/push в workspace)
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY backend/ ./
# Собранный frontend отдаётся FastAPI из backend/static
COPY --from=frontend /app/frontend/dist ./static

# Непривилегированный пользователь; state-файлы (.env, workspace-state) — volume при желании
RUN useradd -m ccl && chown -R ccl:ccl /app
USER ccl

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
