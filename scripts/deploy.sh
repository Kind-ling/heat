#!/usr/bin/env bash
# deploy.sh — Install @kind-ling/heat as a systemd service
# Usage: sudo ./scripts/deploy.sh [--user ubuntu] [--port 3001]
#
# Idempotent: safe to run multiple times.

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
SERVICE_USER="ubuntu"
PORT="3001"
SERVICE_NAME="heat"
ENV_FILE="/etc/heat.env"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

# ── Arg parsing ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --user)
      SERVICE_USER="$2"
      shift 2
      ;;
    --port)
      PORT="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: sudo $0 [--user ubuntu] [--port 3001]" >&2
      exit 1
      ;;
  esac
done

# ── Root check ────────────────────────────────────────────────────────────────
if [[ "${EUID}" -ne 0 ]]; then
  echo "Error: This script must be run as root (sudo)." >&2
  exit 1
fi

# ── Verify service user exists ────────────────────────────────────────────────
if ! id -u "${SERVICE_USER}" &>/dev/null; then
  echo "Error: User '${SERVICE_USER}' does not exist." >&2
  echo "Create it first: useradd -m -s /bin/bash ${SERVICE_USER}" >&2
  exit 1
fi

# ── Verify env file exists ────────────────────────────────────────────────────
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Error: ${ENV_FILE} not found." >&2
  echo "Run: sudo ./scripts/setup-env.sh" >&2
  exit 1
fi

# ── Install package ───────────────────────────────────────────────────────────
echo "==> Installing @kind-ling/heat globally via npm..."
npm install -g @kind-ling/heat

HEAT_BIN="$(which heat 2>/dev/null || npm bin -g)/heat"
if [[ ! -x "${HEAT_BIN}" ]]; then
  # Fallback: find it in npm global bin
  HEAT_BIN="$(npm bin -g)/heat"
fi
echo "    heat binary: ${HEAT_BIN}"

# ── Write systemd unit ────────────────────────────────────────────────────────
echo "==> Writing ${SERVICE_FILE}..."
cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=Heat — x402 reputation oracle (@kind-ling/heat)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
EnvironmentFile=${ENV_FILE}
Environment=PORT=${PORT}
ExecStart=${HEAT_BIN}
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/tmp

[Install]
WantedBy=multi-user.target
EOF

# ── Reload, enable, start ─────────────────────────────────────────────────────
echo "==> Reloading systemd daemon..."
systemctl daemon-reload

echo "==> Enabling ${SERVICE_NAME} service..."
systemctl enable "${SERVICE_NAME}"

echo "==> Starting (or restarting) ${SERVICE_NAME} service..."
if systemctl is-active --quiet "${SERVICE_NAME}"; then
  systemctl restart "${SERVICE_NAME}"
else
  systemctl start "${SERVICE_NAME}"
fi

# ── Health check ──────────────────────────────────────────────────────────────
echo "==> Waiting for service to be ready..."
ATTEMPTS=12
SLEEP=5
HEALTH_URL="http://localhost:${PORT}/health"

for ((i = 1; i <= ATTEMPTS; i++)); do
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${HEALTH_URL}" || true)
  if [[ "${HTTP_STATUS}" == "200" ]]; then
    echo "==> Health check passed (${HEALTH_URL} → 200)"
    break
  fi
  if [[ "${i}" -eq "${ATTEMPTS}" ]]; then
    echo "Error: Health check failed after $((ATTEMPTS * SLEEP))s. Last status: ${HTTP_STATUS}" >&2
    echo "Check logs with: journalctl -u ${SERVICE_NAME} -n 50" >&2
    exit 1
  fi
  echo "    Attempt ${i}/${ATTEMPTS}: got ${HTTP_STATUS}, retrying in ${SLEEP}s..."
  sleep "${SLEEP}"
done

echo ""
echo "✓ Heat is running on port ${PORT}"
echo "  Logs:    journalctl -u ${SERVICE_NAME} -f"
echo "  Status:  systemctl status ${SERVICE_NAME}"
echo "  Stop:    systemctl stop ${SERVICE_NAME}"
