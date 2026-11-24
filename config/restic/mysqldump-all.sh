#!/usr/bin/env bash
# Dumps every running mysql container to a gzip'd, all-databases SQL file.
# Called by restic-backup.sh immediately before the restic run. Takes the
# destination directory as its argument; it must sit inside the volume
# being backed up.
#   mysqldump-all.sh /mnt/postcode/backup
set -euo pipefail

DUMP_DIR="${1:-/mnt/postcode/backup}"
mkdir -p "$DUMP_DIR"

mapfile -t containers < <(docker ps --format '{{.Names}}\t{{.Image}}' \
  | awk -F'\t' 'tolower($2) ~ /(^|\/)(mysql|percona)([:@]|$)/ {print $1}')

if [ "${#containers[@]}" -eq 0 ]; then
  echo "WARNING: no mysql containers matched, no dumps written" >&2
  exit 0
fi

for container in "${containers[@]}"; do
  PASS=$(docker exec "$container" printenv MYSQL_ROOT_PASSWORD 2>/dev/null || true)

  if [ -z "$PASS" ]; then
    echo "WARNING: no root password found in $container, skipping" >&2
    continue
  fi

  TMPFILE="${DUMP_DIR}/${container}.sql.gz.tmp"
  FINAL="${DUMP_DIR}/${container}.sql.gz"

  docker exec -e MYSQL_PWD="$PASS" "$container" \
    mysqldump -uroot --all-databases --routines --events \
    --single-transaction --quick --set-gtid-purged=OFF \
    | gzip > "$TMPFILE"

  mv "$TMPFILE" "$FINAL"
done