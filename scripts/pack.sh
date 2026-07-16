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

# 仅打包扩展运行所需文件，排除开发/测试产物
zip -r "$ZIP_PATH" \
  manifest.json \
  background.js \
  content.js \
  popup.html \
  popup.css \
  popup.js \
  icons \
  shared \
  README.md \
  CHANGELOG.md

echo "Packed: ${ZIP_PATH}"
ls -lh "$ZIP_PATH"
