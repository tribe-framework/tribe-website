# Tribe

A web project management framework for building platforms, products and web interfaces using a modular approach.

Visit https://tribe-framework.org

---

## Quick Start

```bash
# 1. Configure
cp .env.sample .env
# Edit .env — set passwords, PROJECT_NAME, BARE_URL

# 2. Start
docker compose up -d
```

That's it. Tribe is running at `http://localhost:12000`.

## Default Ports

| Service       | Port    |
| ------------- | ------- |
| Tribe         | `12000` |
| phpMyAdmin    | `12001` |
| Junction      | `12002` |
| Dist (static) | `12003` |
| Dist (PHP)    | `12004` |

All ports are configurable in `.env`.

## CLI

```bash
docker compose up -d       # start
docker compose down        # stop
docker compose logs -f     # tail logs
```

## Tribe — Advanced Reference

### Glossary

| Term            | Definition                                                           |
| --------------- | -------------------------------------------------------------------- |
| **Tribe**       | PHP content/app framework — core backend and UI engine               |
| **Junction**    | CMS layer connecting to Tribe via API                                |
| **Docker**      | Containerisation platform; `docker-compose.yml` defines all services |
| **.env**        | Environment file holding secrets and config                          |
| **MySQL**       | Relational database storing all Tribe content and data               |
| **phpMyAdmin**  | Web UI for browsing and managing MySQL databases                     |
| **Caddy**       | Web server / reverse proxy — handles HTTP, routes to PHP-FPM         |
| **Loom**        | Multi-tenant shared infrastructure hosting many adjacent Threads     |
| **Thread**      | A single Tribe + Junction instance adjacent a Loom setup             |
| **Tor**         | Overlay mode routing all traffic through `.onion` hidden services    |

---

### Full Folder Structure

```
applications/          # App code
  tribe/               # Tribe PHP application
  junction/            # Junction frontend (dist/)

config/                # Service configuration
  mysql/               # my.cnf, install.sql
  tribe/               # Caddyfile, supervisord.conf, watcher.sh, indexer scripts
  junction/            # Caddyfile
  dist/                # Caddyfile (static site)
  dist-php/            # Caddyfile (PHP site)
  tor/                 # Tor daemon config and helpers
    README.tor.md      # ← Tor setup guide
    docker-compose.tor.yml
    .env.tor.sample
    torrc
    tor-addresses.sh

uploads/               # All runtime data (gitignored)
  sites/
    dist/              # Static site files
    dist-php/          # PHP site files
  tor/                 # .onion keys and hostnames

logs/                  # Runtime logs (gitignored)

docker-compose.yml     # Standard single-project setup
.env.sample            # Standard env template
```

---

### Advanced Modes

#### Tor — Anonymous hidden services

Tor mode layers `docker-compose.tor.yml` on top of the standard setup. All ports are removed from the host; services are reachable only via `.onion` addresses.

**To use Tor:**

```bash
# 1. Copy files to project root
mv config/tor/docker-compose.tor.yml .
mv config/tor/.env.tor.sample .

# 2. Follow the guide
# config/tor/README.tor.md
```

→ Full instructions: [config/tor/README.tor.md](config/tor/README.tor.md)

---

### License

GNU General Public License — free, copyleft.
