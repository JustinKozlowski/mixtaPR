#!/bin/bash
set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
DIM='\033[2m'
RESET='\033[0m'

REPO="JustinKozlowski/mixtaPR"
BRANCH="main"
HOOKS_DIR="$HOME/.git-hooks"
EXT_DIR="$HOME/.mixtapr/extension"
CONFIG_PATH="$HOME/.mixtapr/config.json"

# Extension files to install (excludes Tailwind build files and node_modules)
EXT_FILES=("manifest.json" "background.js" "content.js" "popup.html" "popup.js" "styles.css")

echo ""
echo -e "${BOLD}🎵 MixtaPR Installer${RESET}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Step 1: Spotify app ───────────────────────────────────────────────────────

echo -e "${BOLD}Step 1 of 4 — Create your Spotify app${RESET}"
echo ""
echo "MixtaPR needs a Spotify Developer app. Creating one is free and takes ~2 minutes."
echo ""
echo -e "${YELLOW}Opening Spotify Developer Dashboard…${RESET}"
open "https://developer.spotify.com/dashboard" 2>/dev/null \
  || xdg-open "https://developer.spotify.com/dashboard" 2>/dev/null \
  || echo "  → https://developer.spotify.com/dashboard"
echo ""
echo "In the dashboard:"
echo "  1. Click 'Create app'"
echo "  2. Fill in any name and description"
echo "  3. Add BOTH of these Redirect URIs:"
echo ""
echo -e "     ${BLUE}http://127.0.0.1:8888/callback${RESET}"
echo -e "     ${BLUE}https://oaldhnfdjoemedkcbcipihifpmgobgmg.chromiumapp.org/${RESET}"
echo ""
echo "  4. Under 'Which API/SDKs are you planning to use?' check 'Web API'"
echo "  5. Save, then open Settings to find your Client ID"
echo ""
read -p "Paste your Client ID: " CLIENT_ID
echo ""

if [ -z "$CLIENT_ID" ]; then
  echo "No Client ID provided. Exiting."
  exit 1
fi

# ── Step 2: Download ──────────────────────────────────────────────────────────

echo -e "${BOLD}Step 2 of 4 — Downloading MixtaPR…${RESET}"
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

curl -fsSL "https://github.com/$REPO/archive/refs/heads/$BRANCH.tar.gz" \
  | tar xz -C "$TEMP_DIR"
SRC="$TEMP_DIR/mixtaPR-$BRANCH"

# ── Step 3: Git hook ──────────────────────────────────────────────────────────

echo -e "${BOLD}Step 3 of 4 — Installing git hook…${RESET}"
mkdir -p "$HOOKS_DIR"

# Patch client ID into hook then install
sed "s/SPOTIFY_CLIENT_ID = \"[^\"]*\"/SPOTIFY_CLIENT_ID = \"$CLIENT_ID\"/" \
  "$SRC/git-hook/post-commit" > "$HOOKS_DIR/post-commit"
chmod +x "$HOOKS_DIR/post-commit"

# Set global hooks path, warn if already pointing elsewhere
EXISTING=$(git config --global core.hooksPath 2>/dev/null || true)
if [ -n "$EXISTING" ] && [ "$EXISTING" != "$HOOKS_DIR" ]; then
  echo ""
  echo -e "${YELLOW}  core.hooksPath is already set to '$EXISTING'${RESET}"
  read -p "  Override it to point to $HOOKS_DIR? [y/N]: " OVERRIDE
  if [[ "$OVERRIDE" =~ ^[Yy]$ ]]; then
    git config --global core.hooksPath "$HOOKS_DIR"
    echo "  Updated."
  else
    echo "  Skipped. The hook is installed but won't run until core.hooksPath is updated."
  fi
else
  git config --global core.hooksPath "$HOOKS_DIR"
fi

# Persist client ID to config (tokens are added later by the hook on first run)
mkdir -p "$(dirname "$CONFIG_PATH")"
if [ -f "$CONFIG_PATH" ] && command -v python3 &>/dev/null; then
  python3 - "$CONFIG_PATH" "$CLIENT_ID" <<'EOF'
import json, sys
path, client_id = sys.argv[1], sys.argv[2]
with open(path) as f:
    cfg = json.load(f)
cfg["spotify_client_id"] = client_id
with open(path, "w") as f:
    json.dump(cfg, f, indent=2)
EOF
else
  echo "{\"spotify_client_id\": \"$CLIENT_ID\"}" > "$CONFIG_PATH"
fi

echo "  Hook installed at $HOOKS_DIR/post-commit"

# ── Step 4: Chrome extension ──────────────────────────────────────────────────

echo -e "${BOLD}Step 4 of 4 — Installing Chrome extension…${RESET}"
mkdir -p "$EXT_DIR"

for filename in "${EXT_FILES[@]}"; do
  src_file="$SRC/chrome-extension/$filename"
  if [ ! -f "$src_file" ]; then continue; fi

  if [ "$filename" = "background.js" ]; then
    # Patch client ID before copying
    sed "s/const SPOTIFY_CLIENT_ID = \"[^\"]*\"/const SPOTIFY_CLIENT_ID = \"$CLIENT_ID\"/" \
      "$src_file" > "$EXT_DIR/$filename"
  else
    cp "$src_file" "$EXT_DIR/$filename"
  fi
done

echo "  Extension installed at $EXT_DIR"
echo ""

# Open chrome://extensions — 'open' on macOS silently ignores chrome:// URLs,
# so open Chrome first then navigate
open -a "Google Chrome" "chrome://extensions" 2>/dev/null || true

echo -e "${BOLD}Load the extension in Chrome:${RESET}"
echo "  1. Go to chrome://extensions"
echo "  2. Enable 'Developer mode' (top-right toggle)"
echo "  3. Click 'Load unpacked'"
echo "  4. Select: ${BLUE}$EXT_DIR${RESET}"
echo ""

# ── Done ──────────────────────────────────────────────────────────────────────

echo -e "${GREEN}${BOLD}✓ Done!${RESET}"
echo ""
echo -e "${DIM}Your next git commit will open Spotify in your browser to authorize.${RESET}"
echo ""
