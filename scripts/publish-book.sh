#!/usr/bin/env bash
# Publish or update book.html on here.now
# Usage: ./scripts/publish-book.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BOOK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PUBLISH_SCRIPT="${HERENOW_PUBLISH:-$HOME/.claude/skills/here-now/scripts/publish.sh}"

if [ ! -f "$PUBLISH_SCRIPT" ]; then
  echo "Error: here-now publish script not found at $PUBLISH_SCRIPT"
  echo "Install: npx skills add heredotnow/skill --skill here-now -g"
  exit 1
fi

# Check for existing slug in state file
SLUG_FLAG=""
if [ -f "$BOOK_DIR/.herenow/state.json" ]; then
  SLUG=$(jq -r '.publishes | keys[0] // empty' "$BOOK_DIR/.herenow/state.json" 2>/dev/null || true)
  if [ -n "$SLUG" ]; then
    echo "Updating existing site: $SLUG"
    SLUG_FLAG="--slug $SLUG"
  fi
fi

cd "$BOOK_DIR"
$PUBLISH_SCRIPT book.html $SLUG_FLAG --client claude-code
