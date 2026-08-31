#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH="${BASH_SOURCE[0]}"
PROJECT_DIR="$(cd -- "$(dirname -- "$SCRIPT_PATH")" && pwd)"
VENV_DIR="$PROJECT_DIR/.venv"
PORT="${PORT:-5000}"

# Prefer the project's own virtual environment, but fall back to the system Python.
if [[ -x "$VENV_DIR/bin/python3" ]]; then
    PYTHON_BIN="$VENV_DIR/bin/python3"
elif command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python3)"
elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python)"
else
    echo "Fehler: Es wurde kein Python 3 gefunden." >&2
    exit 1
fi

cd "$PROJECT_DIR"

# Create venv only if it does not exist yet.
if [[ ! -x "$VENV_DIR/bin/python3" ]] && [[ -d "$VENV_DIR" ]]; then
    echo "Virtuelle Umgebung existiert, aber python3 fehlt. Bitte .venv neu erzeugen."
fi
if [[ ! -x "$VENV_DIR/bin/python3" ]] && [[ ! -d "$VENV_DIR" ]]; then
    echo "Virtuelle Umgebung wird erstellt..."
    python3 -m venv "$VENV_DIR" || {
        echo "Fehler beim Erzeugen der virtuellen Umgebung." >&2
        exit 1
    }
    PYTHON_BIN="$VENV_DIR/bin/python3"
fi

echo "Abhängigkeiten werden geprüft..."
"$PYTHON_BIN" -m pip install -q -r "$PROJECT_DIR/requirements.txt"

if command -v curl >/dev/null 2>&1 && curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
    echo "Das Backend läuft bereits auf http://127.0.0.1:$PORT"
    exit 0
fi

echo "Backend wird auf http://127.0.0.1:$PORT gestartet..."
exec env PORT="$PORT" "$PYTHON_BIN" "$PROJECT_DIR/app.py"
cd /home/hepa/Documents/Development/Cocktailmixer_LF12a
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py