#!/bin/bash
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/mz-inventory-agent}"
read -r -p "Server-URL (z.B. https://server/inventory): " SERVER_URL
read -r -p "API-Key: " API_KEY
read -r -p "Device-ID optional: " DEVICE_ID

if [ "$EUID" -ne 0 ]; then
  echo "Bitte als root ausführen."
  exit 1
fi

apt-get update -q
apt-get install -y nodejs npm
mkdir -p "$INSTALL_DIR"
cp mz-agent.js package.json "$INSTALL_DIR/"
cd "$INSTALL_DIR"
npm ci --omit=dev

cat > /etc/systemd/system/mz-inventory-agent.service << EOF
[Unit]
Description=MZ-Inventory Lite Agent
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node mz-agent.js
Restart=on-failure
RestartSec=10
Environment=SERVER_URL=$SERVER_URL
Environment=API_KEY=$API_KEY
Environment=DEVICE_ID=$DEVICE_ID

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable mz-inventory-agent
systemctl start mz-inventory-agent
echo "Agent installiert."
