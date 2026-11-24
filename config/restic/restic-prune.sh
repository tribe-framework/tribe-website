#!/usr/bin/env bash
# Installed on `local` at /usr/local/bin/restic-prune.sh
# Takes the same volume path as restic-backup.sh and prunes the matching
# repository on the local disk.
#   restic-prune.sh                 # prunes the default, /mnt/postcode
#   restic-prune.sh /mnt/volume
set -euo pipefail

SOURCE="${1:-/mnt/postcode}"
SOURCE="${SOURCE%/}"
REPO_ROOT=/media/cityowl/WD-Internal/restic

export RESTIC_REPOSITORY="${REPO_ROOT}/$(basename "$SOURCE")-backup"
export RESTIC_PASSWORD_FILE=/etc/restic/password

restic forget --prune \
  --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --keep-yearly 3 \
  --retry-lock 2h

exec restic check --read-data-subset=2%
