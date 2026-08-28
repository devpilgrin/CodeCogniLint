@echo off
title Hybrid Code Analysis — Backend
cd /d "%~dp0backend"

if not exist ".venv" (
    echo [INFO] Создаём виртуальное окружение .venv ...
    python -m venv .venv
)

call .venv\Scripts\activate

if not exist ".venv\.deps-ok" (
    echo [INFO] Устанавливаем зависимости Python ...
    pip install -r requirements.txt
    type nul > ".venv\.deps-ok"
)

if not exist ".env" (
    copy ".env.example" ".env" >nul
    echo [INFO] Создан .env из .env.example
)

if not exist "projects" mkdir projects

echo [INFO] Запуск FastAPI на http://localhost:8000
echo [INFO] Документация: http://localhost:8000/docs
echo.
uvicorn main:app --reload --reload-exclude "projects/*" --reload-exclude "*.json" --host 0.0.0.0 --port 8000
