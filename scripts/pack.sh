#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -p "require('./package.json').version")"
OUT_DIR="${ROOT}/dist"
ZIP_NAME="xxt-auto-${VERSION}.zip"
ZIP_PATH="${OUT_DIR}/${ZIP_NAME}"

mkdir -p "$OUT_DIR"
rm -f "$ZIP_PATH"

zip -r "$ZIP_PATH" . \
  -x "*.git*" \
  -x "*node_modules*" \
  -x "*tests/browsers*" \
  -x "*dist*" \
  -x "*.DS_Store" \
  -x "*package-lock.json"

echo "Packed: ${ZIP_PATH}"
ls -lh "$ZIP_PATH"
