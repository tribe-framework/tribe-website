#!/usr/bin/env bash
# Installed on `server` at /usr/local/bin/restic-backup.sh
# One script, one argument: the absolute path of the volume to back up.
#   restic-backup.sh                 # backs up the default, /mnt/postcode
#   restic-backup.sh /mnt/volume     # backs up any other volume
# The repository name is derived from the last path component, so
# /mnt/postcode -> postcode-backup.
set -euo pipefail

SOURCE="${1:-/mnt/postcode}"

case "$SOURCE" in
  /*) ;;
  *) echo "volume must be an absolute path, got: $SOURCE" >&2 ; exit 64 ;;
esac

SOURCE="${SOURCE%/}"
REPO="$(basename "$SOURCE")-backup"

mountpoint -q "$SOURCE"

# Refresh the mysql dumps inside this volume first, so the snapshot always
# captures a dump taken minutes ago rather than one from the previous day.
# Failing to dump must not silently produce a dump-less backup.
/usr/local/bin/mysqldump-all.sh "${SOURCE}/backup"

export RESTIC_REPOSITORY="rest:http://local:8000/${REPO}/"
export RESTIC_PASSWORD_FILE=/etc/restic/password
export RESTIC_CACHE_DIR=/var/cache/restic

restic snapshots >/dev/null 2>&1 || restic init

exec restic backup "$SOURCE" \
  --one-file-system \
  --exclude-file=./exclude.txt \
  --exclude-caches \
  --retry-lock 30m \
  --cleanup-cache \
  -o rest.connections=10 \
  --verbose
