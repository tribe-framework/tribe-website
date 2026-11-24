#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# config/ubuntu/setup.sh — Provision an Ubuntu (>= 24.04) host to run the Tribe / Loom stack.
#
# Installs and configures:
#   • ufw      — firewall, opens 22 (SSH), 80, 443 (+ optional direct service ports)
#   • Docker   — Engine + Compose plugin (official Docker apt repo)
#   • Node.js  — current LTS via NodeSource (runs the `loom` and `tribe` CLIs)
#   • nginx    — host reverse proxy that `tribe` / `loom` write configs into
#   • certbot  — Let's Encrypt client + nginx plugin for automatic SSL
#   • helpers  — curl, unzip, git, ca-certificates, etc.
#
# Usage:
#   sudo ./config/ubuntu/setup.sh                 # standard install (recommended)
#   sudo ./config/ubuntu/setup.sh --open-services # ALSO open Docker service ports 12000-12008
#                                    # and thread range 13000-13999 in ufw
#   sudo ./config/ubuntu/setup.sh --no-firewall   # skip ufw configuration entirely
#
# Safe to re-run: every step is idempotent and checks before acting.
#
# After it finishes:
#   1. log out and back in (so your user picks up the `docker` group), then
#   2. cp _env.sample .env  and edit it
#   3. docker compose up -d
#   4. node tribe         (host nginx + SSL for the base stack)
#   5. node loom create <thread>
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Options ──────────────────────────────────────────────────────────────────
OPEN_SERVICES=0
CONFIGURE_FIREWALL=1
NODE_MAJOR=22          # Node LTS major to install

for arg in "$@"; do
  case "$arg" in
    --open-services) OPEN_SERVICES=1 ;;
    --no-firewall)   CONFIGURE_FIREWALL=0 ;;
    -h|--help)
      sed -n '2,/^set -euo/{ /^set -euo/d; s/^# \{0,1\}//; p; }' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg (use --help)"; exit 1 ;;
  esac
done

# ─── Colours / logging ────────────────────────────────────────────────────────
RED=$'\e[0;31m'; GREEN=$'\e[0;32m'; YELLOW=$'\e[1;33m'; CYAN=$'\e[0;36m'; BOLD=$'\e[1m'; NC=$'\e[0m'
log()  { echo "${GREEN}✓${NC}  $*"; }
info() { echo "${CYAN}→${NC}  $*"; }
warn() { echo "${YELLOW}⚠${NC}  $*"; }
err()  { echo "${RED}✗${NC}  $*" >&2; }
die()  { err "$*"; exit 1; }
section() { echo; echo "${BOLD}── $* ──${NC}"; }

# ─── Pre-flight ───────────────────────────────────────────────────────────────
[ "$(id -u)" -eq 0 ] || die "Please run as root:  sudo ./config/ubuntu/setup.sh"

if [ ! -r /etc/os-release ]; then die "Cannot read /etc/os-release — is this Ubuntu?"; fi
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] || warn "This script targets Ubuntu; detected ID='${ID:-unknown}'. Continuing anyway."

# Require Ubuntu >= 24.04
ver_major="${VERSION_ID%%.*}"
if [ -n "${ver_major:-}" ] && [ "$ver_major" -lt 24 ] 2>/dev/null; then
  die "Ubuntu >= 24.04 required; detected ${VERSION_ID:-unknown}."
fi
log "Ubuntu ${VERSION_ID:-?} (${VERSION_CODENAME:-?}) detected."

# The non-root user to add to the docker group (the human who invoked sudo).
TARGET_USER="${SUDO_USER:-}"
if [ -z "$TARGET_USER" ] || [ "$TARGET_USER" = "root" ]; then
  TARGET_USER=""
  warn "Could not determine a non-root user; skipping 'docker' group assignment."
fi

export DEBIAN_FRONTEND=noninteractive

# ─── Base packages ────────────────────────────────────────────────────────────
section "Base packages"
info "apt-get update..."
apt-get update -y -qq
info "Installing prerequisites..."
apt-get install -y -qq \
  ca-certificates curl gnupg lsb-release apt-transport-https \
  software-properties-common unzip git jq ufw
log "Base packages installed."

# ─── Docker Engine + Compose plugin (official repo) ───────────────────────────
section "Docker"
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  log "Docker + compose plugin already present ($(docker --version | awk '{print $3}' | tr -d ','))."
else
  info "Adding Docker apt repository..."
  install -m 0755 -d /etc/apt/keyrings
  if [ ! -f /etc/apt/keyrings/docker.asc ]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
  fi
  ARCH="$(dpkg --print-architecture)"
  CODENAME="${VERSION_CODENAME:-$(lsb_release -cs)}"
  echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y -qq
  info "Installing Docker Engine, CLI, containerd, buildx, compose..."
  apt-get install -y -qq \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  log "Docker installed ($(docker --version))."
fi

systemctl enable --now docker >/dev/null 2>&1 || true
log "Docker service enabled and running."

if [ -n "$TARGET_USER" ]; then
  if id -nG "$TARGET_USER" | tr ' ' '\n' | grep -qx docker; then
    log "User '$TARGET_USER' already in 'docker' group."
  else
    usermod -aG docker "$TARGET_USER"
    log "Added '$TARGET_USER' to 'docker' group (log out/in to take effect)."
  fi
fi

# ─── Node.js (NodeSource LTS) ─────────────────────────────────────────────────
section "Node.js"
need_node=1
if command -v node >/dev/null 2>&1; then
  cur="$(node -v | sed 's/^v//; s/\..*//')"
  if [ "${cur:-0}" -ge 20 ] 2>/dev/null; then
    log "Node.js already present ($(node -v))."
    need_node=0
  else
    warn "Node.js $(node -v) is older than required; upgrading."
  fi
fi
if [ "$need_node" -eq 1 ]; then
  info "Adding NodeSource repo for Node ${NODE_MAJOR}.x..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs
  log "Node.js installed ($(node -v), npm $(npm -v))."
fi

# ─── nginx ────────────────────────────────────────────────────────────────────
section "nginx"
if command -v nginx >/dev/null 2>&1; then
  log "nginx already present ($(nginx -v 2>&1 | awk -F/ '{print $2}'))."
else
  info "Installing nginx..."
  apt-get install -y -qq nginx
  log "nginx installed."
fi

# Ensure sites-available / sites-enabled exist and are wired into nginx.conf.
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
if ! grep -q 'sites-enabled' /etc/nginx/nginx.conf; then
  warn "nginx.conf does not include sites-enabled; adding include directive."
  # Insert the include inside the http { } block.
  sed -i '/http {/a\    include /etc/nginx/sites-enabled/*;' /etc/nginx/nginx.conf
fi

# Remove the stock default site so it doesn't shadow real server_names on :80.
if [ -e /etc/nginx/sites-enabled/default ]; then
  rm -f /etc/nginx/sites-enabled/default
  log "Removed nginx default site."
fi

systemctl enable --now nginx >/dev/null 2>&1 || true
if nginx -t >/dev/null 2>&1; then
  systemctl reload nginx || true
  log "nginx configured and running."
else
  warn "nginx -t reported a problem; review /etc/nginx/nginx.conf."
fi

# ─── certbot (+ nginx plugin) ─────────────────────────────────────────────────
section "certbot (Let's Encrypt)"
if command -v certbot >/dev/null 2>&1; then
  log "certbot already present ($(certbot --version 2>&1 | awk '{print $2}'))."
else
  info "Installing certbot and the nginx plugin..."
  apt-get install -y -qq certbot python3-certbot-nginx
  log "certbot installed."
fi

# ─── ufw firewall ─────────────────────────────────────────────────────────────
if [ "$CONFIGURE_FIREWALL" -eq 1 ]; then
  section "Firewall (ufw)"
  info "Setting default policies (deny incoming, allow outgoing)..."
  ufw --force default deny incoming  >/dev/null
  ufw --force default allow outgoing >/dev/null

  # Essential ports.
  ufw allow 22/tcp   comment 'SSH'    >/dev/null
  ufw allow 80/tcp   comment 'HTTP'   >/dev/null
  ufw allow 443/tcp  comment 'HTTPS'  >/dev/null
  log "Allowed 22, 80, 443."

  if [ "$OPEN_SERVICES" -eq 1 ]; then
    info "Opening direct Docker service ports (12000-12008) and thread range (13000-13999)..."
    ufw allow 12000:12008/tcp comment 'Tribe base services' >/dev/null
    ufw allow 13000:13999/tcp comment 'Loom threads'        >/dev/null
    log "Direct service ports opened."
    warn "Note: Docker publishes container ports via its own iptables chain, which"
    warn "bypasses ufw. These rules are belt-and-braces; to actually restrict"
    warn "published ports, bind them to 127.0.0.1 in compose or use DOCKER-USER rules."
  else
    info "Direct service ports left CLOSED (traffic should arrive via nginx on 80/443)."
    info "Re-run with --open-services if you need them reachable directly."
  fi

  ufw --force enable >/dev/null
  log "ufw enabled."
  ufw status verbose | sed 's/^/    /'
else
  section "Firewall (ufw)"
  warn "Skipped (--no-firewall). Make sure 22/80/443 are reachable by other means."
fi

# ─── Summary ──────────────────────────────────────────────────────────────────
section "Done"
log "Host provisioned for Tribe / Loom."
echo
echo "  Installed:"
echo "    docker   $(docker --version 2>/dev/null | awk '{print $3}' | tr -d ',')   compose $(docker compose version --short 2>/dev/null)"
echo "    node     $(node -v 2>/dev/null)        npm $(npm -v 2>/dev/null)"
echo "    nginx    $(nginx -v 2>&1 | awk -F/ '{print $2}')"
echo "    certbot  $(certbot --version 2>&1 | awk '{print $2}')"
echo