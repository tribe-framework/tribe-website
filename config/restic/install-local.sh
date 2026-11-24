#!/usr/bin/env bash
# Run on `local`. Installs the rest-server, backup, and prune systemd units.
# Assumes: Tailscale is up, restic is installed, /etc/restic/password exists,
# and rest-server binary is at /usr/local/bin/rest-server.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNIT_DIR="$SCRIPT_DIR/systemd"

if [ ! -x /usr/local/bin/rest-server ]; then
  echo "ERROR: /usr/local/bin/rest-server not found." >&2
  echo "Download the release for this architecture from" >&2
  echo "  https://github.com/restic/rest-server/releases" >&2
  echo "then: sudo install -m755 rest-server /usr/local/bin/rest-server" >&2
  exit 1
fi

sudo install -m755 "$SCRIPT_DIR"/restic-prune.sh /usr/local/bin/restic-prune.sh

sudo cp "$UNIT_DIR"/rest-server.service /etc/systemd/system/
sudo cp "$UNIT_DIR"/restic-backup@.service /etc/systemd/system/
sudo cp "$UNIT_DIR"/restic-backup@.timer /etc/systemd/system/
sudo cp "$UNIT_DIR"/restic-prune@.service /etc/systemd/system/
sudo cp "$UNIT_DIR"/restic-prune@.timer /etc/systemd/system/

echo "NOTE: edit /etc/systemd/system/rest-server.service and replace 100.x.y.z"
echo "      with this machine's Tailscale IPv4 address (tailscale ip -4)."

sudo mkdir -p /media/cityowl/WD-Internal/restic

sudo systemctl daemon-reload
sudo systemctl enable --now rest-server

cat <<'MSG'

Timers are named after the volume path, escaped by systemd-escape, so
/mnt/postcode becomes the instance -mnt-postcode. Enable them once
rest-server is confirmed up:

  sudo systemctl enable --now "restic-backup@$(systemd-escape /mnt/postcode).timer"
  sudo systemctl enable --now "restic-prune@$(systemd-escape /mnt/postcode).timer"

  # and for any additional volume:
  # sudo systemctl enable --now "restic-backup@$(systemd-escape /mnt/volume).timer"
  # sudo systemctl enable --now "restic-prune@$(systemd-escape /mnt/volume).timer"
MSG
