#!/usr/bin/env bash
# CodeCogniLint — запуск обоих сервисов (Backend :8000 + Frontend :3000)
# Linux / macOS: ./start-all.sh
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=========================================="
echo "  HYBRID CORE v1.0 — Запуск окружения"
echo "=========================================="
echo ""

echo "[INFO] Запуск Backend (порт 8000)..."
"$ROOT/start-backend.sh" > "$ROOT/backend.log" 2>&1 &
BACKEND_PID=$!

sleep 2

echo "[INFO] Запуск Frontend (порт 3000)..."
"$ROOT/start-frontend.sh" > "$ROOT/frontend.log" 2>&1 &
FRONTEND_PID=$!

echo ""
echo "Готово! Открой http://localhost:3000 в браузере."
echo "Логи: backend.log / frontend.log"
echo "Для остановки нажми Ctrl+C."

cleanup() {
    echo ""
    echo "[INFO] Останавливаем сервисы..."
    kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
    wait 2>/dev/null || true
    exit 0
}
trap cleanup INT TERM

wait
