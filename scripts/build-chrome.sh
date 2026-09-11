#!/usr/bin/env bash

# copies src/ to dist/chrome

set -euo pipefail

cd "$(dirname "$0")/.."

rm -rf dist/chrome
cp -a src dist/chrome
rm -f dist/chrome/*.zip

# js/lib/* is already minified;
find dist/chrome -path '*/js/lib' -prune -o -name '*.js' -exec sh -c '
  npx terser "$1" --compress --mangle -o "$1.tmp" && mv "$1.tmp" "$1"
' sh {} \;

echo "Built dist/chrome"
