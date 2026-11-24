# restic-tribe

Restic-based volume backups for the `tribe` stack, pulling from `server` to
`local` over Tailscale. Companion doc: https://tribe-framework.org/backup (the
in-app manual page — copy it into the tribe app's templates directory).

## Layout

```
config/restic/
├── restic-backup.sh          # runs on `server`, dumps mysql then runs restic
├── mysqldump-all.sh          # runs on `server`, dumps every mysql/mariadb container
├── restic-prune.sh           # runs on `local`, forget + prune + check
├── exclude.txt               # restic exclude patterns, installed to /etc/restic/exclude.txt on `server`
├── install-server.sh         # installs restic + scripts + exclude file on `server`
├── install-local.sh          # installs rest-server units + prune script on `local`
└── systemd/
    ├── rest-server.service
    ├── restic-backup@.service
    ├── restic-backup@.timer
    ├── restic-prune@.service
    └── restic-prune@.timer
```

## Volumes are named by path

Every script and every unit identifies a volume by its absolute path, and the
default everywhere is `/mnt/postcode`. The repository name is derived from the
last path component, so `/mnt/postcode` backs up into `postcode-backup`.

systemd instances use the `systemd-escape` form of the path, so the timer for
`/mnt/postcode` is `restic-backup@-mnt-postcode.timer`. Always let the shell
build the name rather than typing it:

```
sudo systemctl start "restic-backup@$(systemd-escape /mnt/postcode).service"
```

## Architecture

- **`server`** (source of the data): `restic-backup.sh` calls `mysqldump-all.sh`
  first, writing fresh gzip'd dumps into `<volume>/backup` (so `/mnt/postcode/backup`
  by default), then runs `restic backup`. The dumps therefore always land inside
  the volume being snapshotted, and are never more than minutes old. Runs when
  triggered by `local` over SSH.
- **`local`** (holds the repository): owns the systemd timers, `rest-server`,
  pruning, and restores. The schedule lives here because this is the machine
  that's not guaranteed to always be on — `Persistent=true` on the timers
  means a missed run fires on next boot instead of being skipped.

Backups run daily at 02:00 IST; prune runs Sundays at 08:00 IST.

Sources on `server`: `/mnt/postcode` (default), optionally `/mnt/volume`.
Repositories on `local`: `/media/cityowl/WD-Internal/restic/`.

## Setup order

1. Install Tailscale on both machines, note `local`'s `100.x.y.z` address,
   enable MagicDNS.
2. On `local`: install the `rest-server` binary to `/usr/local/bin/rest-server`
   from https://github.com/restic/rest-server/releases, run `install-local.sh`,
   edit `rest-server.service` to bind the correct Tailscale IP, confirm
   `rest-server` is up.
3. On `server`: run `install-server.sh`.
4. Put a shared key at `/etc/restic/password` (mode 644) on **both** machines.
5. Give root on `local` a passwordless SSH key into `server`
   (`ssh-copy-id root@server`).
6. Enable the timers on `local`:
   ```
   sudo systemctl enable --now "restic-backup@$(systemd-escape /mnt/postcode).timer"
   sudo systemctl enable --now "restic-prune@$(systemd-escape /mnt/postcode).timer"
   # sudo systemctl enable --now "restic-backup@$(systemd-escape /mnt/volume).timer"
   # sudo systemctl enable --now "restic-prune@$(systemd-escape /mnt/volume).timer"
   ```

Full day-to-day operation, troubleshooting, retention, and migration
instructions are in `https://tribe-framework.org/backup`.
