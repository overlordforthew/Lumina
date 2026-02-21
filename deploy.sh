#!/bin/bash
# Auto-deploy script — called by webhook on git push
set -e
cd /root/Lumina
git pull origin main
docker compose up --build -d
echo "$(date) — Lumina deployed" >> /var/log/lumina-deploy.log
