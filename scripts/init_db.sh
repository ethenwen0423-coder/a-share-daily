#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
PYTHONPATH=backend .venv/bin/python -c 'from app.core.database import Base, engine; import app.models; Base.metadata.create_all(engine); print("数据库已初始化")'
