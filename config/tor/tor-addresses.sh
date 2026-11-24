#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# tor-addresses.sh — print all .onion hostnames after `docker compose ... up`
#
# Usage:
#   ./tor-addresses.sh
#   ./tor-addresses.sh --wait   # block until all addresses are available
# ══════════════════════════════════════════════════════════════════════════════

SERVICES=(tribe junction dist dist-php phpmyadmin)
TOR_DIR="./uploads/tor"
WAIT=false

[ "$1" = "--wait" ] && WAIT=true

wait_for_hostname() {
    local svc="$1"
    local file="${TOR_DIR}/${svc}/hostname"
    if $WAIT; then
        echo -n "Waiting for ${svc}..."
        until [ -f "$file" ] 2>/dev/null; do sleep 2; echo -n "."; done
        echo ""
    fi
}

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Tribe Framework — Tor Hidden Service Addresses"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

for svc in "${SERVICES[@]}"; do
    wait_for_hostname "$svc"
    file="${TOR_DIR}/${svc}/hostname"
    if [ -f "$file" ]; then
        onion=$(cat "$file")
        printf "  %-14s  http://%s\n" "${svc}" "${onion}"
    else
        printf "  %-14s  (not ready — run with --wait or check: %s)\n" "${svc}" "$file"
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Admin services (phpMyAdmin)"
echo "  are Tor-only — no clearnet port is exposed."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
