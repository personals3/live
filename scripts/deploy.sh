#!/usr/bin/env bash
# Build ps3-live and publish the static dist/ to the gitDeploy remote.
#
# One-time setup:
#   git remote add deploy <gitDeploy-repo-url-for-live.personals3.tech>
#
# Usage:
#   scripts/deploy.sh
# Env overrides:
#   VITE_LIVE_URL   stream URL baked into the bundle
#                   (default https://personals3.tech/api/live)
#   DEPLOY_REMOTE   git remote name (default: deploy)
#   DEPLOY_BRANCH   branch gitDeploy serves (default: main)
set -euo pipefail
cd "$(dirname "$0")/.."

STREAM_URL="${VITE_LIVE_URL:-https://personals3.tech/api/live}"
REMOTE="${DEPLOY_REMOTE:-deploy}"
BRANCH="${DEPLOY_BRANCH:-main}"

git remote get-url "$REMOTE" >/dev/null 2>&1 || {
  echo "error: git remote '$REMOTE' is not configured." >&2
  echo "  git remote add $REMOTE <gitDeploy-repo-url>" >&2
  exit 1
}

# Build — local node if present, otherwise the same dockerized node the
# rest of this homelab uses.
if command -v npm >/dev/null 2>&1; then
  [ -d node_modules ] || npm install --no-audit --no-fund
  VITE_LIVE_URL="$STREAM_URL" npm run build
else
  docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp \
    -e VITE_LIVE_URL="$STREAM_URL" -v "$PWD":/app -w /app node:22-alpine \
    sh -c '[ -d node_modules ] || npm install --no-audit --no-fund; npm run build'
fi

# Publish dist/ as a self-contained orphan commit: gitDeploy serves the
# repo root, so dist's CONTENTS become the site root. Force-push — the
# deploy repo is an artifact, its history is disposable.
SHA=$(git rev-parse --short HEAD)
URL=$(git remote get-url "$REMOTE")
TMP=$(mktemp -d)
cp -r dist/. "$TMP"/
git -C "$TMP" init -q -b "$BRANCH"
git -C "$TMP" add -A
git -C "$TMP" -c user.name="ps3-live-deploy" -c user.email="deploy@localhost" \
  commit -q -m "deploy ps3-live $SHA ($STREAM_URL)"
git -C "$TMP" push -f "$URL" "$BRANCH"
rm -rf "$TMP"
echo "deployed $SHA -> $URL ($BRANCH)"
