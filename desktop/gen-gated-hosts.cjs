// Generates electron/gated-hosts.json from the backend's live CDN probe
// (netmirror-server/cdns.json). Run before every desktop build so the
// main-process Referer rewrite always matches the CURRENT CDN hosts.
// Never hand-edit the two lists again — this is the single bridge.
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'netmirror-server', 'cdns.json');
const OUT = path.join(__dirname, 'electron', 'gated-hosts.json');

let live = [];
let updatedAt = null;
try {
  const cdns = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  updatedAt = cdns.updatedAt || null;
  live = (cdns.hosts || []).filter((h) => h.status === 'live').map((h) => h.host);
} catch (_) { /* no probe data yet — main falls back to built-ins */ }

fs.writeFileSync(OUT, JSON.stringify({ updatedAt, hosts: live }, null, 2));
console.log(`[gen-gated-hosts] ${live.length} live hosts${updatedAt ? ` (probed ${updatedAt})` : ' (no probe data — built-in fallback)'} → ${OUT}`);
