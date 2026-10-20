#!/usr/bin/env bash
# Installation automatique sur Ubuntu (Oracle Cloud, etc.) : Node 20 + Caddy (HTTPS gratuit) + service qui redémarre tout seul.
# Usage : sudo bash deploy.sh ton-sous-domaine.duckdns.org
set -e
DOMAIN="$1"
[ -z "$DOMAIN" ] && { echo "Usage : sudo bash deploy.sh ton-domaine"; exit 1; }
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_USER="${SUDO_USER:-ubuntu}"
[ -f "$APP_DIR/.env" ] || { echo "Crée d'abord le fichier .env (cp .env.example .env) et remplis-le."; exit 1; }

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl gpg build-essential python3 debian-keyring debian-archive-keyring apt-transport-https iptables-persistent

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Caddy (reverse proxy + certificat HTTPS automatique)
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y && apt-get install -y caddy
printf '%s {\n  reverse_proxy localhost:3000\n}\n' "$DOMAIN" > /etc/caddy/Caddyfile
systemctl restart caddy

# Pare-feu de la machine : ports 80 et 443
iptables -I INPUT -p tcp --dport 80 -j ACCEPT
iptables -I INPUT -p tcp --dport 443 -j ACCEPT
netfilter-persistent save

# Dépendances + service
sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && npm install --omit=dev"
cat > /etc/systemd/system/modbot.service <<UNIT
[Unit]
Description=Bot Discord de moderation
After=network-online.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now modbot
echo "Terminé. Dashboard : https://$DOMAIN   |   Logs du bot : journalctl -u modbot -f"
