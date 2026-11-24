# Tribe on Tor

## Setup

Before using Tor mode, move its files to the project root:

```bash
mv config/tor/docker-compose.tor.yml .
mv config/tor/.env.tor.sample .
```

Then:

```bash
# 1. Configure (same .env as clearnet, with Tor-specific notes below)
cp .env.tor.sample .env
# Edit .env — DB passwords, PROJECT_NAME, etc.

# 2. Start in Tor mode
docker compose -f docker-compose.yml -f docker-compose.tor.yml up -d

# 3. Wait ~30s for Tor to generate keys, then read addresses
bash config/tor/tor-addresses.sh --wait
```

Output:
```
  tribe           http://abc123...onion
  junction        http://def456...onion
  dist            http://ghi789...onion
  dist-php        http://jkl012...onion
  phpmyadmin      http://mno345...onion
```

## How it works

`docker-compose.tor.yml` layers on top of the standard `docker-compose.yml`. It does two things: adds the `tor` daemon, and nulls out all host port bindings.

**Never run both modes simultaneously on one project.**

```
Clearnet:  docker compose up -d
Tor:       docker compose -f docker-compose.yml -f docker-compose.tor.yml up -d
```

## File layout

```
config/
  tor/
    torrc                    # Tor daemon config (6 hidden services)
    tor-addresses.sh         # helper: print all .onion URLs
uploads/
  tor/
    tribe/hostname           # .onion address (written on first boot)
    junction/hostname
    dist/hostname
    dist-php/hostname
    phpmyadmin/hostname      # admin — Tor only, no clearnet port
docker-compose.yml           # base (unchanged)
docker-compose.tor.yml       # Tor overlay
```

## BARE_URL

Your `.onion` address isn't known at startup. Set it after first boot:

```bash
BARE_URL=$(cat uploads/tor/tribe/hostname)
# Restart to pick up the change:
docker compose -f docker-compose.yml -f docker-compose.tor.yml restart php_tribe
```

Or set it manually in `.env`:
```
BARE_URL=youraddress.onion
```

## Backup your keys

`.onion` addresses are derived from private keys in `uploads/tor/<service>/`.  
**Losing these keys permanently changes your addresses.**

```bash
# Backup
tar -czf tor-keys-backup.tar.gz uploads/tor/

# Restore (before docker compose up)
tar -xzf tor-keys-backup.tar.gz
```

## Security checklist

| Concern | Status |
|---------|--------|
| Admin ports exposed on clearnet | ✗ Never in Tor mode |
| App ports exposed on host | ✗ All `ports: []` in overlay |
| Tor daemon exits/relays traffic | ✗ `ExitPolicy reject *:*`, `SocksPort 0` |
| Hidden service version | ✓ v3 (ed25519, 56-char addresses) |
| Key persistence | ✓ Stored in `uploads/tor/` |

## Analytics warning

Do **not** configure Plausible or any clearnet analytics service in Tor mode — it deanonymises visitors. Leave `PLAUSIBLE_AUTH` and `PLAUSIBLE_DOMAIN` blank, or self-host Plausible as its own hidden service.

## Switching modes

Always bring the stack down before switching:

```bash
# Clearnet → Tor
docker compose down
docker compose -f docker-compose.yml -f docker-compose.tor.yml up -d

# Tor → Clearnet
docker compose -f docker-compose.yml -f docker-compose.tor.yml down
docker compose up -d
```

## Pinning the Tor image

The overlay uses `torproject/tor:latest`. To pin:

```yaml
# docker-compose.tor.yml
tor:
  image: torproject/tor:0.4.8.12
```