#!/usr/bin/env bash
# Double-click launcher for macOS.
# This just calls metadata.sh, which must sit in the same folder.

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$DIR/metadata.sh"

echo ""
echo "Press any key to close this window..."
read -n 1 -s
