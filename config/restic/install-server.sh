#!/usr/bin/env bash
# Run on `server`. Installs restic, the backup + mysqldump scripts, and the
# exclude file. Assumes Tailscale is up and `local` resolves via MagicDNS.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

sudo apt update
sudo apt install -y restic
sudo restic self-update

sudo install -m755 "$SCRIPT_DIR"/restic-backup.sh /usr/local/bin/restic-backup.sh
sudo install -m755 "$SCRIPT_DIR"/mysqldump-all.sh /usr/local/bin/mysqldump-all.sh

sudo mkdir -p /etc/restic
sudo install -m644 "$SCRIPT_DIR"/exclude.txt /etc/restic/exclude.txt

echo "NOTE: /etc/restic/password must exist (mode 644) and be identical to the"
echo "      copy on 'local' before the first backup run."
echo ""
echo "No cron entry is needed: restic-backup.sh calls mysqldump-all.sh itself,"
echo "so the dumps are always refreshed immediately before the snapshot."
echo "Check the dump step alone with:"
echo "  sudo /usr/local/bin/mysqldump-all.sh /mnt/postcode/backup"
