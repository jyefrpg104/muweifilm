#!/usr/bin/env bash
# Local dev preview: run all checks, then serve dist/ exactly as production would.
# Usage: bash scripts/preview.sh [port]   (default port 8000)
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${1:-8000}"

bash scripts/run-checks.sh

echo
echo "Local preview:  http://localhost:${PORT}/"
echo "  Photo Quest:  http://localhost:${PORT}/photo-quest/"
echo "  reifo:        http://localhost:${PORT}/reifo/"
echo "Press Ctrl+C to stop."
python3 -m http.server "$PORT" --directory dist
