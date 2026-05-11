@echo off
title Hybrid Code Analysis — Frontend
cd /d "%~dp0frontend"

if not exist "node_modules" (
    echo [INFO] Устанавливаем зависимости...
    call npm install
)

echo [INFO] Запуск React на http://localhost:3000
echo.
call npm run dev
