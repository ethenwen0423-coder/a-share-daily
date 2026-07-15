#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
cleanup(){ kill "${BACKEND_PID:-}" "${FRONTEND_PID:-}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
scripts/start_backend.sh & BACKEND_PID=$!
scripts/start_frontend.sh & FRONTEND_PID=$!
wait
