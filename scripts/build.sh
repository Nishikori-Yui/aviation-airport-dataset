#!/usr/bin/env bash
set -euo pipefail

VERSION=${1:-$(date +%Y-%m-%d)}
OUT=${2:-data/airports.json}

export DATASET_VERSION="$VERSION"

node scripts/fetch-overpass.cjs --out "$OUT" --version "$VERSION"
