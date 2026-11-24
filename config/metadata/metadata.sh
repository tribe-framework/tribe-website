#!/usr/bin/env bash
# Archive — Metadata Generator
# Usage: ./metadata.sh [/optional/path/to/disk]
# Output: archive-metadata.csv written inside the disk root
# Compatible with macOS (BSD stat) and Ubuntu/Linux (GNU stat)
#
# READ-ONLY: This script only reads and indexes files.
# It never renames, modifies, moves, or deletes anything.

set -euo pipefail

# ──────────────────────────────────────────────
# DISK ROOT: default to the script's own directory
# ──────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DISK_ROOT="${1:-$(dirname "$SCRIPT_DIR")}"
DISK_ROOT="${DISK_ROOT%/}"   # strip trailing slash

if [[ ! -d "$DISK_ROOT" ]]; then
  echo "Error: '$DISK_ROOT' is not a directory."
  exit 1
fi

OUT="$SCRIPT_DIR/metadata-archive-$(date +%s).csv"

# ──────────────────────────────────────────────
# TRIBE SYSTEM FOLDERS TO SKIP
# Image resize variants + video + Tribe internals
# ──────────────────────────────────────────────
SKIP_DIRS=(
  "xs" "sm" "md" "lg" "xl"   # Tribe image size variants
  "hls"                        # Tribe video streaming segments
  "tribe-cache"
  "tribe-temp"
  "metadata-generator"
  "metadata.sh"
  "tmp"
  ".git"
  ".DS_Store"                  # macOS metadata (files, handled below)
  "__MACOSX"                   # macOS archive artifacts
  "node_modules"
)

# Build a single prune expression for `find`
PRUNE_EXPR=()
for dir in "${SKIP_DIRS[@]}"; do
  PRUNE_EXPR+=(-name "$dir" -o)
done
# Remove trailing -o
unset 'PRUNE_EXPR[${#PRUNE_EXPR[@]}-1]'

# ──────────────────────────────────────────────
# YEAR DETECTION
# Looks for a YYYY folder name in:
#   1. The relative path segments of the file (up to 3 levels deep)
#   2. Current folder, parent, grandparent of the *script* location
# ──────────────────────────────────────────────
find_year_in_path() {
  local relpath="$1"     # relative path from disk root
  local year=""

  # Walk path segments (left to right), find first YYYY segment
  IFS='/' read -ra PARTS <<< "$relpath"
  for part in "${PARTS[@]}"; do
    if [[ "$part" =~ ^[0-9]{4}$ ]] && (( part >= 1900 && part <= 2100 )); then
      year="$part"
      break
    fi
  done

  # If not found in the file's path, check script's own ancestry
  # (current dir → parent → grandparent), capped at 3 levels
  if [[ -z "$year" ]]; then
    local check_dir="$SCRIPT_DIR"
    for _ in 1 2 3; do
      local segment
      segment=$(basename "$check_dir")
      if [[ "$segment" =~ ^[0-9]{4}$ ]] && (( segment >= 1900 && segment <= 2100 )); then
        year="$segment"
        break
      fi
      check_dir=$(dirname "$check_dir")
    done
  fi

  printf '%s' "$year"
}

# ──────────────────────────────────────────────
# CSV HELPERS (read-only — no file changes)
# ──────────────────────────────────────────────
escape_csv() {
  local val="$1"
  if printf '%s' "$val" | grep -qE '[,"]'; then
    val=$(printf '%s' "$val" | sed 's/"/""/g')
    printf '"%s"' "$val"
  else
    printf '%s' "$val"
  fi
}

# ──────────────────────────────────────────────
# WRITE HEADER (only file we touch is the CSV itself)
# ──────────────────────────────────────────────
printf 'filename,filepath,year,format,size_mb,date_modified,category\n' > "$OUT"

total=0

# ──────────────────────────────────────────────
# FIND — recurse all subdirs, prune system folders
# Excludes: the CSV output file, .DS_Store, hidden files
# ──────────────────────────────────────────────
while IFS= read -r abs; do
  filename=$(basename "$abs")

  # Skip .DS_Store and other macOS junk files
  [[ "$filename" == ".DS_Store" ]] && continue
  [[ "$filename" == "._"* ]]       && continue
  # Skip dotfiles/hidden files
  [[ "$filename" == .* ]]          && continue

  # Relative directory from disk root
  relpath="${abs#$DISK_ROOT/}"
  reldir=$(dirname "$relpath")
  [[ "$reldir" == "." ]] && reldir=""

  # Extension (lowercased)
  ext="${filename##*.}"
  if [[ "$ext" == "$filename" ]]; then
    ext_lower="(none)"
  else
    ext_lower=$(printf '%s' "$ext" | tr '[:upper:]' '[:lower:]')
  fi

  # Size in MB
  size_bytes=$(stat -c%s "$abs" 2>/dev/null \
            || stat -f%z "$abs" 2>/dev/null \
            || echo 0)
  size_mb=$(awk "BEGIN {printf \"%.2f\", ${size_bytes}/1048576}")

  # Date modified (YYYY-MM-DD)
  date_mod=$(stat -c%y "$abs" 2>/dev/null | cut -d' ' -f1 \
          || stat -f "%Sm" -t "%Y-%m-%d" "$abs" 2>/dev/null \
          || echo "")

  # Year from path or script ancestry
  year=$(find_year_in_path "$relpath")

  # Category: top-level directory under disk root
  category=""
  if [[ -n "$reldir" && "$reldir" != "." ]]; then
    category=$(printf '%s' "$reldir" | cut -d'/' -f1)
    # If top-level segment is a YYYY folder, use the next segment as category
    if [[ "$category" =~ ^[0-9]{4}$ ]]; then
      next_seg=$(printf '%s' "$reldir" | cut -d'/' -f2)
      [[ -n "$next_seg" ]] && category="$next_seg"
    fi
  fi

  printf '%s,%s,%s,%s,%s,%s,%s\n' \
    "$(escape_csv "$filename")" \
    "$(escape_csv "$reldir")" \
    "$year" \
    "$ext_lower" \
    "$size_mb" \
    "$date_mod" \
    "$(escape_csv "$category")" >> "$OUT"

  total=$((total + 1))

done < <(
  find "$DISK_ROOT" \
    \( "${PRUNE_EXPR[@]}" \) -prune \
    -o -type f \
       ! -name "archive-metadata.csv" \
       ! -name "metadata.sh" \
       ! -name "metadata.command" \
       ! -name ".DS_Store" \
       ! -name "._*" \
    -print \
  | sort
)

echo "Done. $total file(s) indexed → $OUT"
