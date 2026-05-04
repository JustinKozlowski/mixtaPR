#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_REPO="${1:-$(pwd)}"

if [ ! -d "$TARGET_REPO/.git" ]; then
  echo "Error: '$TARGET_REPO' is not a git repository." >&2
  exit 1
fi

HOOK_DIR="$TARGET_REPO/.git/hooks"
HOOK_DEST="$HOOK_DIR/post-commit"

# If an existing post-commit hook exists that isn't ours, chain it
if [ -f "$HOOK_DEST" ] && ! grep -q "mixtaPR" "$HOOK_DEST" 2>/dev/null; then
  echo "Existing post-commit hook found — wrapping it."
  EXISTING="$HOOK_DIR/post-commit.pre-mixtapr"
  mv "$HOOK_DEST" "$EXISTING"
  cat > "$HOOK_DEST" << 'EOF'
#!/usr/bin/env bash
# Run original hook first
"$(dirname "$0")/post-commit.pre-mixtapr" "$@"
# Then run MixtaPR hook
python3 "$(dirname "$0")/post-commit.mixtapr" "$@"
EOF
  cp "$SCRIPT_DIR/post-commit" "$HOOK_DIR/post-commit.mixtapr"
  chmod +x "$HOOK_DEST" "$HOOK_DIR/post-commit.mixtapr"
else
  cp "$SCRIPT_DIR/post-commit" "$HOOK_DEST"
  chmod +x "$HOOK_DEST"
fi

echo "✓ MixtaPR post-commit hook installed in $TARGET_REPO"
echo ""
echo "On your first commit a browser window will open to authorize Spotify."
