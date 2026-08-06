#!/usr/bin/env sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$PROJECT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Orbit requires Node.js for development. Install it from https://nodejs.org/ and try again." >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "Orbit could not find npm on PATH." >&2
  exit 1
fi
if [ ! -f "node_modules/electron/package.json" ]; then
  echo "Installing Orbit development dependencies..."
  npm install
fi

exec npm run dev
