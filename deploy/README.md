# Kakumei deployment

- Origin: `137.23.45.53`; site: `https://stream.kyzenhub.site`.
- Caddy serves `/var/www/kakumei`, `/app/`, and `/downloads/`.
- API: `/opt/kakumei/backend`, systemd `kakumei-api`, port `3005`.
- `/etc/caddy/Caddyfile` imports `/etc/caddy/sites/*.caddy`. Deploy updates only `kakumei.caddy`; other sites stay in the shared Caddyfile.
- Caddy obtains and renews the public certificate. The explicit `10.0.0.207` TLS bind is this VPS's public NAT interface; Tailscale has its own port 443 listener.

Run `bash deploy/deploy.sh` from the repo root in a shell with Node.js, rsync, and SSH access. Dependency, API restart, Caddy validation, and public checks must all pass. The remote installer saves Caddy rollback files before changing the site.

Run `node deploy/verify.mjs` to check HTTPS, SPA deep links, missing assets, API health, and downloadable artifacts. Build/upload the desktop installer and signed APK separately before advertising updated downloads.

Migration rollback configs remain on the server. Routine deployments use Caddy; no certbot or nginx reload is needed.

## Watch party (signaling + TURN)
- PeerJS broker: systemd `kakumei-peerjs` on 127.0.0.1:9000, routed at `/myapp/*` on the app site. Clients use `wss://stream.kyzenhub.site/myapp`.
- TURN: the box's existing coturn carries a `kyzen` user (same credential as the backup box) alongside jam's user; config backup at `/root/turnserver.conf.bak`. Clients try `137.23.45.53:3478` first, then `13.48.248.209:3478`, then OpenRelay.
- Origin :443 serves a Caddy-managed Let's Encrypt cert, so Cloudflare can be flipped from Flexible to Full (Strict) in the dashboard whenever convenient.
