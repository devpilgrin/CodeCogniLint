#!/usr/bin/env bash
# CodeCogniLint — Backend (FastAPI)
# Linux / macOS: ./start-backend.sh
set -e
cd "$(dirname "$0")/backend"

PYTHON_BIN="python3"
command -v python3 >/dev/null 2>&1 || PYTHON_BIN="python"

if [ ! -d ".venv" ]; then
    echo "[INFO] Создаём виртуальное окружение .venv ..."
    "$PYTHON_BIN" -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate

if [ ! -f ".venv/.deps-ok" ]; then
    echo "[INFO] Устанавливаем зависимости Python ..."
    pip install -r requirements.txt
    touch ".venv/.deps-ok"
fi

if [ ! -f ".env" ]; then
    cp ".env.example" ".env"
    echo "[INFO] Создан .env из .env.example"
fi

mkdir -p projects

echo "[INFO] Запуск FastAPI на http://localhost:8000"
echo "[INFO] Документация: http://localhost:8000/docs"
echo ""
exec uvicorn main:app --reload --reload-exclude "projects/*" --reload-exclude "*.json" --host 0.0.0.0 --port 8000
