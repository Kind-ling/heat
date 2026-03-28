#!/usr/bin/env bash
# setup-env.sh — Configure /etc/heat.env interactively
# Usage: sudo ./scripts/setup-env.sh
#
# Validates HEAT_PAYMENT_ADDRESS (0x + 40 hex chars) before writing.

set -euo pipefail

ENV_FILE="/etc/heat.env"
DEFAULT_PORT="3001"

# ── Root check ────────────────────────────────────────────────────────────────
if [[ "${EUID}" -ne 0 ]]; then
  echo "Error: This script must be run as root (sudo)." >&2
  exit 1
fi

# ── Determine service user (match deploy.sh default) ─────────────────────────
SERVICE_USER="ubuntu"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --user)
      SERVICE_USER="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: sudo $0 [--user ubuntu]" >&2
      exit 1
      ;;
  esac
done

if ! id -u "${SERVICE_USER}" &>/dev/null; then
  echo "Error: User '${SERVICE_USER}' does not exist." >&2
  exit 1
fi

# ── Prompt for HEAT_PAYMENT_ADDRESS ──────────────────────────────────────────
while true; do
  read -r -p "HEAT_PAYMENT_ADDRESS (0x... 42 chars, required): " HEAT_PAYMENT_ADDRESS
  if [[ -z "${HEAT_PAYMENT_ADDRESS}" ]]; then
    echo "Error: HEAT_PAYMENT_ADDRESS is required." >&2
    continue
  fi
  if [[ ! "${HEAT_PAYMENT_ADDRESS}" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
    echo "Error: Invalid address — must be 0x followed by exactly 40 hex characters." >&2
    continue
  fi
  break
done

# ── Prompt for PORT ───────────────────────────────────────────────────────────
read -r -p "PORT (default: ${DEFAULT_PORT}): " PORT_INPUT
PORT="${PORT_INPUT:-${DEFAULT_PORT}}"

if ! [[ "${PORT}" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
  echo "Error: PORT must be a number between 1 and 65535." >&2
  exit 1
fi

# ── Write env file ────────────────────────────────────────────────────────────
echo "==> Writing ${ENV_FILE}..."
cat > "${ENV_FILE}" <<EOF
HEAT_PAYMENT_ADDRESS=${HEAT_PAYMENT_ADDRESS}
PORT=${PORT}
EOF

# Secure: owned by service user, readable only by owner + root
chown "root:${SERVICE_USER}" "${ENV_FILE}"
chmod 640 "${ENV_FILE}"

echo "✓ Wrote ${ENV_FILE}"
echo "  HEAT_PAYMENT_ADDRESS=${HEAT_PAYMENT_ADDRESS}"
echo "  PORT=${PORT}"
echo ""
echo "Next: sudo ./scripts/deploy.sh [--user ${SERVICE_USER}] [--port ${PORT}]"
