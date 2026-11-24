#!/bin/bash
set -e

TRIBE_REPO="https://github.com/tribe-framework/tribe.git"
TRIBE_TMP="/tmp/tribe-upstream-$$"
TARGET="${1:-.}"   # pass your project path as arg, or run from project root

# ── Folders/files to NEVER overwrite ──────────────────────────────────────────
EXCLUDES=(
  ".env"
  "uploads/"
  "logs/"
  "config/mysql/"          # project-specific DB config
  "applications/tribe/custom"  # tribe custom folder
  "threads/"             # always ignored for use in Loom
)
# ──────────────────────────────────────────────────────────────────────────────

echo "→ Cloning latest tribe..."
git clone --depth=1 "$TRIBE_REPO" "$TRIBE_TMP"

# ── Build a list of excluded patterns for manual checks ───────────────────────
is_excluded() {
  local file="$1"
  for pattern in "${EXCLUDES[@]}"; do
    # Strip trailing slash for prefix matching
    local p="${pattern%/}"
    if [[ "$file" == "$p" || "$file" == "$p/"* ]]; then
      return 0
    fi
  done
  return 1
}

# ── Interactive sync: check each file before overwriting ──────────────────────
echo "→ Checking files for differences..."

while IFS= read -r -d '' src_file; do
  rel="${src_file#$TRIBE_TMP/}"

  # Skip .git entries
  [[ "$rel" == .git* ]] && continue

  # Skip excluded paths
  is_excluded "$rel" && continue

  dst_file="$TARGET/$rel"

  # If destination doesn't exist, copy silently
  if [[ ! -e "$dst_file" ]]; then
    mkdir -p "$(dirname "$dst_file")"
    cp "$src_file" "$dst_file"
    echo "  [new]  $rel"
    continue
  fi

  # If it's a directory, skip (rsync handles structure)
  [[ -d "$src_file" ]] && continue

  src_size=$(stat -c%s "$src_file" 2>/dev/null || stat -f%z "$src_file")
  dst_size=$(stat -c%s "$dst_file" 2>/dev/null || stat -f%z "$dst_file")

  if [[ "$src_size" -ne "$dst_size" ]]; then
    echo ""
    echo "  ┌─ Modified: $rel"
    echo "  │  Current size : ${dst_size} bytes"
    echo "  │  Upstream size: ${src_size} bytes"
    printf "  └─ Replace? [y/N/d(iff)] "
    read -r answer </dev/tty

    case "$answer" in
      d|D)
        diff --color=always "$dst_file" "$src_file" || true
        printf "     Replace? [y/N] "
        read -r answer </dev/tty
        [[ "$answer" =~ ^[Yy]$ ]] && cp "$src_file" "$dst_file" && echo "     ✓ Replaced." || echo "     ✗ Skipped."
        ;;
      y|Y)
        cp "$src_file" "$dst_file"
        echo "     ✓ Replaced."
        ;;
      *)
        echo "     ✗ Skipped."
        ;;
    esac
  else
    # Same size — overwrite silently (likely identical or binary-equivalent)
    cp "$src_file" "$dst_file"
  fi

done < <(find "$TRIBE_TMP" -not -type d -print0)

echo ""
echo "→ Cleaning up..."
rm -rf "$TRIBE_TMP"

echo "✓ Done. Review changes with: git diff"