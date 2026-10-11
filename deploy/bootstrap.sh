#!/usr/bin/env bash
# One-time setup of a public rBazaar server on a fresh Debian or Ubuntu machine. Run as root:
#   TUNNEL_TOKEN=... ANTHROPIC_API_KEY=... bash bootstrap.sh
# Installs Docker, clones this repository to /opt/rbazaar, writes the server's own .env from
# .env.example, starts the stack behind a Cloudflare Tunnel (no inbound port is needed), and
# installs a timer that redeploys when main changes and restarts the gateway if it stops answering.
# Wallet keys are not set here: payments stay "not configured" until they are added to .env.
set -euo pipefail
REPO=${REPO:-https://github.com/ryansgao/bab-hack.git}
DIR=/opt/rbazaar
[ "$(id -u)" = 0 ] || { echo 'Run as root.' >&2; exit 1; }
: "${TUNNEL_TOKEN:?Set TUNNEL_TOKEN to the Cloudflare Tunnel connector token}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git unattended-upgrades >/dev/null
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' > /etc/apt/apt.conf.d/20auto-upgrades
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh

[ -d "$DIR/.git" ] || git clone -q "$REPO" "$DIR"
cd "$DIR"
umask 077
if [ ! -f .env ]; then
  cp .env.example .env
  set_var() { if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi; }
  set_var SERVICE_KEY "$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  set_var ANTHROPIC_API_KEY "${ANTHROPIC_API_KEY:-}"
  # Each plan is a paid Anthropic call; these bound what strangers can spend.
  set_var PLANNER_MAX_CALLS_PER_DAY 200
  set_var PLANNER_MAX_CALLS_PER_VISITOR_HOUR 10
fi
printf 'TUNNEL_TOKEN=%s\n' "$TUNNEL_TOKEN" > .env.tunnel

cat > /usr/local/bin/rbazaar-redeploy <<'EOF'
#!/usr/bin/env bash
# Redeploy when main has moved; restart the gateway if it no longer answers.
set -euo pipefail
cd /opt/rbazaar
dc() { docker compose -f docker-compose.yml -f deploy/compose.yml "$@"; }
git fetch -q origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  git reset -q --hard origin/main
  dc up -d --build --remove-orphans
  docker image prune -f >/dev/null
fi
dc exec -T api python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=5)" \
  || dc up -d --force-recreate api
EOF
chmod 755 /usr/local/bin/rbazaar-redeploy
cat > /etc/systemd/system/rbazaar-redeploy.service <<'EOF'
[Unit]
Description=Redeploy rBazaar when main changes and keep the gateway answering
After=docker.service
[Service]
Type=oneshot
ExecStart=/usr/local/bin/rbazaar-redeploy
EOF
cat > /etc/systemd/system/rbazaar-redeploy.timer <<'EOF'
[Unit]
Description=Check rBazaar every two minutes
[Timer]
OnBootSec=1min
OnUnitActiveSec=2min
[Install]
WantedBy=timers.target
EOF

docker compose -f docker-compose.yml -f deploy/compose.yml up -d --build --remove-orphans
systemctl daemon-reload
systemctl enable -q --now rbazaar-redeploy.timer

for _ in $(seq 1 30); do
  if docker compose -f docker-compose.yml -f deploy/compose.yml exec -T api python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=5).read().decode())"; then
    echo 'rBazaar is up. The tunnel connects within a few seconds.'; exit 0
  fi
  sleep 3
done
echo 'The gateway did not answer. See: docker compose -f docker-compose.yml -f deploy/compose.yml logs --tail 50' >&2
exit 1
