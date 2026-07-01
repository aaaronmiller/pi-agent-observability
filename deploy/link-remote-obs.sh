#!/usr/bin/env bash
# ============================================================================
#  link-remote-obs.sh — connect THIS machine (e.g. Windows/WSL2) to the central
#  Pi Observability server running on the Fedora box, over a persistent SSH
#  forward tunnel. After this runs:
#    * this machine's pi extension sends events to the central server
#    * http://localhost:43190 on this machine shows the same central UI
#
#  Run this ON THE REMOTE machine (the one that does NOT host the server).
#  Idempotent / re-runnable.
# ============================================================================
set -euo pipefail

# --- config (override via env) ----------------------------------------------
SERVER_HOST="${OBS_SERVER_HOST:-192.168.0.200}"   # Fedora box LAN IP (or Tailscale/hostname)
SERVER_USER="${OBS_SERVER_USER:-misscheta}"
OBS_PORT="${OBS_PORT:-43190}"
OBS_TOKEN="${OBS_AUTH_TOKEN:-devtoken}"            # MUST match the server's token
SSH_PORT="${OBS_SSH_PORT:-22}"

echo "→ Linking to central obs at ${SERVER_USER}@${SERVER_HOST}:${SSH_PORT}, forwarding :${OBS_PORT}"

# --- 1. prerequisites -------------------------------------------------------
command -v ssh >/dev/null || { echo "ssh not found — install openssh-client"; exit 1; }
if ! command -v autossh >/dev/null; then
  echo "→ installing autossh (keeps the tunnel alive)…"
  if   command -v apt >/dev/null; then sudo apt update -y && sudo apt install -y autossh
  elif command -v dnf >/dev/null; then sudo dnf install -y autossh
  else echo "!! install autossh manually, then re-run"; exit 1; fi
fi

# --- 2. verify SSH reachability + key auth ---------------------------------
if ! ssh -o BatchMode=yes -o ConnectTimeout=6 -p "$SSH_PORT" \
        "${SERVER_USER}@${SERVER_HOST}" true 2>/dev/null; then
  echo "!! Cannot SSH to ${SERVER_USER}@${SERVER_HOST} with key auth."
  echo "   Set up a key first:  ssh-keygen -t ed25519  &&  ssh-copy-id -p ${SSH_PORT} ${SERVER_USER}@${SERVER_HOST}"
  echo "   (and confirm the server is reachable — same LAN, or use Tailscale for cross-network)"
  exit 1
fi
echo "✓ SSH key auth OK"

# --- 3. persistent tunnel as a user systemd service (WSL2 needs systemd=true) -
if command -v systemctl >/dev/null && systemctl --user show-environment >/dev/null 2>&1; then
  UDIR="$HOME/.config/systemd/user"; mkdir -p "$UDIR"
  cat > "$UDIR/obs-tunnel.service" <<UNIT
[Unit]
Description=SSH tunnel to central Pi Observability (${SERVER_HOST}:${OBS_PORT})
After=network-online.target

[Service]
Environment=AUTOSSH_GATETIME=0
ExecStart=$(command -v autossh) -M 0 -N \\
  -o ServerAliveInterval=15 -o ServerAliveCountMax=3 \\
  -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=accept-new \\
  -p ${SSH_PORT} -L 127.0.0.1:${OBS_PORT}:127.0.0.1:${OBS_PORT} \\
  ${SERVER_USER}@${SERVER_HOST}
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
UNIT
  systemctl --user daemon-reload
  systemctl --user enable --now obs-tunnel.service
  loginctl enable-linger "$USER" 2>/dev/null || true
  echo "✓ tunnel running as user service (obs-tunnel.service)"
else
  echo "→ systemd --user unavailable; starting autossh in background (add to shell startup for persistence)"
  pkill -f "L 127.0.0.1:${OBS_PORT}:127.0.0.1:${OBS_PORT}" 2>/dev/null || true
  AUTOSSH_GATETIME=0 autossh -M 0 -f -N \
    -o ServerAliveInterval=15 -o ServerAliveCountMax=3 \
    -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=accept-new \
    -p "$SSH_PORT" -L "127.0.0.1:${OBS_PORT}:127.0.0.1:${OBS_PORT}" \
    "${SERVER_USER}@${SERVER_HOST}"
  echo "✓ autossh tunnel started (backgrounded)"
fi

# --- 4. env for this machine's pi extension --------------------------------
RC="${HOME}/.zshrc"; [ -f "$RC" ] || RC="${HOME}/.bashrc"
if ! grep -q "OBS_AUTH_TOKEN=" "$RC" 2>/dev/null; then
  {
    echo ""
    echo "# Pi Observability (central server via SSH tunnel on localhost:${OBS_PORT})"
    echo "export OBS_AUTH_TOKEN=${OBS_TOKEN}"
    echo "export OBS_SERVER_URL=http://127.0.0.1:${OBS_PORT}"
  } >> "$RC"
  echo "✓ added OBS_AUTH_TOKEN / OBS_SERVER_URL to ${RC} (open a new shell to load)"
else
  echo "• OBS_AUTH_TOKEN already in ${RC} — leaving as-is"
fi

# --- 4b. install the pi-observability extension (source-linked to the repo) --
# Assumes this repo is synced to the same path on this machine. Adjust REPO if not.
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PI_EXT_DIR="${HOME}/.pi/agent/extensions"
if [ -f "${REPO}/extension/pi-observability.ts" ] && [ -d "${HOME}/.pi/agent" ]; then
  mkdir -p "$PI_EXT_DIR"
  ln -sf "${REPO}/extension/pi-observability.ts" "${PI_EXT_DIR}/pi-observability.ts"
  echo "✓ pi-observability extension symlinked into ${PI_EXT_DIR}"
else
  echo "• skip extension install (repo extension or ~/.pi/agent not found here)"
fi

# --- 5. verify --------------------------------------------------------------
echo "→ verifying central server through the tunnel…"
if curl -fsS -m5 "http://127.0.0.1:${OBS_PORT}/health" >/dev/null 2>&1; then
  echo "✓ DONE. Central obs reachable at http://localhost:${OBS_PORT}"
  echo "  Run pi here (with the pi-observability extension installed) and its"
  echo "  sessions will appear in the shared dashboard."
else
  echo "!! tunnel up but /health not reachable — check the server is running on the Fedora box"
fi
