#!/usr/bin/env bash
# CodeCogniLint — Frontend (React + Vite)
# Linux / macOS: ./start-frontend.sh
set -e
cd "$(dirname "$0")/frontend"

if [ ! -d "node_modules" ]; then
    echo "[INFO] Устанавливаем зависимости ..."
    npm install
fi

echo "[INFO] Запуск React на http://localhost:3000"
echo ""
exec npm run dev
