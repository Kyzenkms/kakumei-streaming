#!/usr/bin/env bash
# Run remotely after uploading kakumei.caddy and kakumei-api.service to /tmp.
set -euo pipefail

test -f /etc/caddy/Caddyfile
test -d /opt/kakumei/backend
backup=$(mktemp -d /etc/caddy/rollback.XXXXXX)
cp -a /etc/caddy/Caddyfile "$backup/Caddyfile"
install -d -m 755 /etc/caddy/sites
if [[ -f /etc/caddy/sites/kakumei.caddy ]]; then
    cp -a /etc/caddy/sites/kakumei.caddy "$backup/kakumei.caddy"
fi
rollback() {
    cp -a "$backup/Caddyfile" /etc/caddy/Caddyfile
    if [[ -f "$backup/kakumei.caddy" ]]; then
        cp -a "$backup/kakumei.caddy" /etc/caddy/sites/kakumei.caddy
    else
        rm -f /etc/caddy/sites/kakumei.caddy
    fi
    systemctl reload caddy
}
trap rollback ERR

install -m 644 /tmp/kakumei.caddy /etc/caddy/sites/kakumei.caddy
if ! grep -Fxq 'import /etc/caddy/sites/*.caddy' /etc/caddy/Caddyfile; then
    printf '\nimport /etc/caddy/sites/*.caddy\n' >> /etc/caddy/Caddyfile
fi
runuser -u caddy -- caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
install -m 644 /tmp/kakumei-api.service /etc/systemd/system/kakumei-api.service
systemctl daemon-reload
systemctl enable kakumei-api
systemctl restart kakumei-api
curl --fail --silent --show-error --retry 6 --retry-connrefused --retry-delay 1 --max-time 20 http://127.0.0.1:3005/api/health
systemctl reload caddy
trap - ERR
printf '\nCaddy rollback files: %s\n' "$backup"
