#!/usr/bin/env bash
# Downloads the OpenSCAD WebAssembly build into public/openscad/.
# Run inside the container: docker compose run --rm web npm run fetch-engine
#
# Uses the official nightly WASM snapshots, which include the Manifold
# geometry backend (~10-100x faster than the old CGAL-only 2022 build).
set -euo pipefail

DEST="public/openscad"
FALLBACK_URL="https://files.openscad.org/snapshots/OpenSCAD-2026.06.08-WebAssembly-web.zip"
mkdir -p "$DEST"

if [ -f "$DEST/openscad.wasm" ] && [ "${FORCE:-0}" != "1" ]; then
  echo "OpenSCAD engine already present in $DEST (set FORCE=1 to re-download)."
  exit 0
fi

echo "Resolving latest WASM snapshot..."
URL=$(curl -fsSL "https://files.openscad.org/snapshots/.snapshot_wasm.js" \
  | grep "WASM_WEB_SNAPSHOT" \
  | grep -o "https://[^']*\.zip" || true)
if [ -z "$URL" ]; then
  echo "Could not resolve latest snapshot, using pinned fallback."
  URL="$FALLBACK_URL"
fi

echo "Downloading $URL"
TMP=$(mktemp -d)
curl -fL --retry 3 -o "$TMP/engine.zip" "$URL"
unzip -o "$TMP/engine.zip" -d "$DEST"
rm -rf "$TMP"

echo "Engine installed:"
ls -la "$DEST"
