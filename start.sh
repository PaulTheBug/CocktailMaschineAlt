#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$PROJECT_DIR/.venv"
PYTHON="$VENV_DIR/bin/python3"
PORT="${PORT:-5000}"

cd "$PROJECT_DIR"

if [[ ! -x "$PYTHON" ]]; then
    echo "Virtuelle Umgebung wird erstellt..."
    python3 -m venv "$VENV_DIR"
fi

echo "Abhängigkeiten werden geprüft..."
"$PYTHON" -m pip install -q -r "$PROJECT_DIR/requirements.txt"

if command -v curl >/dev/null 2>&1 && curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
    echo "Das Backend läuft bereits auf http://127.0.0.1:$PORT"
    exit 0
fi

echo "Backend wird auf http://127.0.0.1:$PORT gestartet..."
exec env PORT="$PORT" "$PYTHON" "$PROJECT_DIR/app.py"
