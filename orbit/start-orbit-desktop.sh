#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORBIT_DIR="${1:-$ROOT_DIR/desktop}"

if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js 20 or newer is required: https://nodejs.org/" >&2
  exit 1
fi

cd "$ORBIT_DIR"
if [[ ! -d node_modules/electron ]]; then
  npm install
fi

unset ELECTRON_RUN_AS_NODE
nohup npm start >"${TMPDIR:-/tmp}/orbit-desktop.log" 2>&1 &
