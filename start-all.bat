@echo off
title Hybrid Code Analysis — Launcher
echo ==========================================
echo   HYBRID CORE v1.0 — Запуск окружения
echo ==========================================
echo.
echo Запускаем Backend (порт 8000) и Frontend (порт 3000)...
echo.

start "Backend" cmd /k "cd /d "%~dp0backend" && call .venv\Scripts\activate && uvicorn main:app --reload --reload-exclude "projects/*" --reload-exclude "*.json" --host 0.0.0.0 --port 8000"
timeout /t 2 /nobreak >nul
start "Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo Готово! Открой http://localhost:3000 в браузере.
echo Для остановки — закрой оба окна.
timeout /t 3 /nobreak >nul
