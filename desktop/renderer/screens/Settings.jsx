import { useEffect, useState } from 'react';
import { Palette, Keyboard, ShieldCheck, Check, SlidersHorizontal, User } from '@phosphor-icons/react';
import MiniAvatar from '@app/components/MiniAvatar';
import { THEMES, ACCENTS, loadThemePref, applyThemePref } from '../theme.js';
import { HOME_RAILS } from '../home-rails';
import { loadUiPrefs, saveUiPrefs } from '../ui-prefs';

const PROFILE_AVATARS = ['🦊', '🐼', '🐉', '👾', '🤖', '🦉', '🐺', '🐱', '🦁', '🐸', '👻', '⚡'];

const TABS = [
  { key: 'profile', label: 'Profile', icon: User },
  { key: 'appearance', label: 'Appearance', icon: Palette },
  { key: 'interface', label: 'Interface', icon: SlidersHorizontal },
  { key: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { key: 'about', label: 'About', icon: ShieldCheck },
];

function Toggle({ on, onFlip, label }) {
  return (
    <button onClick={onFlip} role="switch" aria-checked={on} aria-label={label}
      className="relative h-6 w-11 shrink-0 rounded-full transition-colors kz-focus-ring"
      style={{ background: on ? 'var(--kz-accent)' : 'rgba(255,255,255,0.14)' }}>
      <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all" style={{ left: on ? '22px' : '2px' }} />
    </button>
  );
}

function Row({ title, sub, control }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] py-2.5 last:border-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white">{title}</p>
        {sub && <p className="truncate text-xs" style={{ color: 'var(--kz-text-muted)' }}>{sub}</p>}
      </div>
      {control}
    </div>
  );
}

export default function Settings() {
  const [tab, setTab] = useState('profile');
  const [pref, setPref] = useState(loadThemePref);
  const [ui, setUi] = useState(loadUiPrefs);
  const [name, setName] = useState(() => localStorage.getItem('kyzen_wp_user') || '');
  const [avatar, setAvatar] = useState(() => localStorage.getItem('kyzen_avatar') || '');

  const saveName = (v) => {
    setName(v);
    try { localStorage.setItem('kyzen_wp_user', v.trim()); } catch { /* private mode */ }
  };
  const saveAvatar = (v) => {
    setAvatar(v);
    try { localStorage.setItem('kyzen_avatar', v); } catch { /* private mode */ }
  };

  const pick = (next) => {
    setPref(next);
    applyThemePref(next);
  };

  useEffect(() => {
    const sync = () => setUi(loadUiPrefs());
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const [diag, setDiag] = useState(null); // { health, cdns }
  const [diagBusy, setDiagBusy] = useState(false);
  const loadDiag = async () => {
    try {
      const [h, c] = await Promise.all([
        fetch('/api/health').then((r) => r.json()).catch(() => null),
        fetch('/api/netmirror/cdns').then((r) => r.json()).catch(() => null),
      ]);
      return { health: h, cdns: c };
    } catch { return { health: null, cdns: null }; }
  };
  // Poll while the About tab is open so uptime/latency stay live.
  useEffect(() => {
    if (tab !== 'about') return;
    let alive = true;
    loadDiag().then((d) => { if (alive) setDiag(d); });
    const t = setInterval(() => { loadDiag().then((d) => { if (alive) setDiag(d); }); }, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [tab]);
  const refreshCdns = async () => {
    setDiagBusy(true);
    try {
      const r = await fetch('/api/admin/refresh-cdns', { method: 'POST' });
      const j = await r.json().catch(() => null);
      if (j?.ok) setDiag(await loadDiag());
    } catch { /* backend down — status dot already shows it */ }
    setDiagBusy(false);
  };

  const setUiPatch = (patch) => {
    const next = { ...ui, ...patch };
    setUi(next);
    saveUiPrefs(next);
  };
  const flipRail = (key) => {
    const hidden = { ...ui.hiddenRails };
    if (hidden[key]) delete hidden[key]; else hidden[key] = true;
    setUiPatch({ hiddenRails: hidden });
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Settings sidebar — one section at a time, no endless scroll */}
      <aside className="flex w-52 shrink-0 flex-col gap-1 border-r p-4"
        style={{ borderColor: 'var(--kz-border)', background: 'var(--kz-bg-elev-0)' }}>
        <h1 className="kz-display mb-3 px-2 text-xl font-bold text-white">Settings</h1>
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)} aria-current={tab === key}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors kz-focus-ring"
            style={tab === key
              ? { background: 'var(--kz-accent-soft)', color: 'white' }
              : { color: 'var(--kz-text-muted)' }}>
            <Icon size={17} weight={tab === key ? 'fill' : 'regular'} />
            {label}
          </button>
        ))}
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto px-10 py-8">
        {tab === 'profile' && (
          <div className="max-w-2xl">
            <h2 className="kz-display mb-1 text-2xl font-bold text-white">Profile</h2>
            <p className="mb-5 text-sm" style={{ color: 'var(--kz-text-muted)' }}>How you appear in watch parties and chat. Saved on this device.</p>

            <div className="rounded-2xl border p-5" style={{ borderColor: 'var(--kz-border)', background: 'var(--kz-surface-1)' }}>
              <div className="flex items-center gap-4">
                <MiniAvatar name={name || 'User'} size={56} ring emoji={avatar} />
                <div className="min-w-0 flex-1">
                  <label htmlFor="profile-name" className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--kz-text-muted)' }}>Display name</label>
                  <input id="profile-name" value={name} maxLength={24} placeholder="User_123"
                    onChange={(e) => saveName(e.target.value)}
                    className="w-full rounded-xl border bg-white/[0.04] px-3 py-2 text-sm text-white outline-none transition-colors kz-focus-ring"
                    style={{ borderColor: 'var(--kz-border)' }} />
                </div>
              </div>

              <h3 className="kz-display mb-2 mt-7 text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--kz-text-muted)' }}>Avatar</h3>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => saveAvatar('')} title="Initials (auto color)"
                  aria-pressed={!avatar} aria-label="Initials avatar"
                  className="grid h-12 w-12 place-items-center rounded-full transition-transform hover:scale-110 kz-focus-ring"
                  style={{ boxShadow: !avatar ? '0 0 0 2px var(--kz-bg), 0 0 0 4px var(--kz-accent)' : 'none' }}>
                  <MiniAvatar name={name || 'User'} size={44} />
                </button>
                {PROFILE_AVATARS.map((em) => {
                  const isActive = avatar === em;
                  return (
                    <button key={em} onClick={() => saveAvatar(em)} title={em}
                      aria-pressed={isActive} aria-label={`Avatar ${em}`}
                      className="grid h-12 w-12 place-items-center rounded-full transition-transform hover:scale-110 kz-focus-ring"
                      style={{ boxShadow: isActive ? '0 0 0 2px var(--kz-bg), 0 0 0 4px var(--kz-accent)' : 'none' }}>
                      <MiniAvatar name={name || 'User'} size={44} emoji={em} />
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs" style={{ color: 'var(--kz-text-muted)' }}>
                {avatar ? 'Your avatar shows in watch party chat and the member list.' : 'Pick an avatar, or keep the auto-colored initial.'}
              </p>
            </div>
          </div>
        )}

        {tab === 'appearance' && (
          <div className="max-w-3xl">
            <h2 className="kz-display mb-1 text-2xl font-bold text-white">Appearance</h2>
            <p className="mb-5 text-sm" style={{ color: 'var(--kz-text-muted)' }}>Theme + accent apply instantly across the app.</p>

            <div className="grid grid-cols-3 gap-2.5 md:grid-cols-6">
              {Object.entries(THEMES).map(([key, t]) => {
                const active = pref.theme === key;
                return (
                  <button key={key} onClick={() => pick({ ...pref, theme: key })} title={`${t.name} — ${t.desc}`}
                    aria-pressed={active}
                    className="overflow-hidden rounded-xl border text-left transition-transform hover:scale-[1.03] kz-focus-ring"
                    style={{ borderColor: active ? 'var(--kz-accent)' : 'var(--kz-border)', background: t.bgElev0 }}>
                    <div className="flex h-11 items-center gap-1 px-2.5" style={{ background: `linear-gradient(135deg, ${t.surface3}, ${t.surface1} 75%)` }}>
                      <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: t.accent }} />
                      <span className="h-4 flex-1 rounded" style={{ background: t.surface2, border: `1px solid ${t.border}` }} />
                    </div>
                    <div className="flex items-center justify-between px-2.5 py-1.5">
                      <p className="truncate text-xs font-semibold" style={{ color: t.text }}>{t.name}</p>
                      {active && <Check size={13} weight="bold" className="shrink-0" style={{ color: 'var(--kz-accent)' }} />}
                    </div>
                  </button>
                );
              })}
            </div>

            <h3 className="kz-display mb-2 mt-7 text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--kz-text-muted)' }}>Accent</h3>
            <div className="flex flex-wrap gap-2">
              {ACCENTS.map((a) => {
                const isActive = pref.accent === a.name;
                return (
                  <button key={a.name} onClick={() => pick({ ...pref, accent: isActive ? null : a.name })}
                    title={isActive ? `${a.name} (click to reset to theme default)` : a.name}
                    aria-pressed={isActive}
                    className="grid h-9 w-9 place-items-center rounded-full transition-transform hover:scale-110 kz-focus-ring"
                    style={{
                      background: `linear-gradient(135deg, ${a.accent}, ${a.accent2})`,
                      boxShadow: isActive ? `0 0 0 2px var(--kz-bg), 0 0 0 4px ${a.accent}` : 'none',
                    }}>
                    {isActive && <Check size={15} weight="bold" className="text-white" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }} />}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs" style={{ color: 'var(--kz-text-muted)' }}>
              {pref.accent ? `Custom accent: ${pref.accent}. Click again for the ${THEMES[pref.theme].name} default.` : `Using the ${THEMES[pref.theme].name} default accent.`}
            </p>
          </div>
        )}

        {tab === 'interface' && (
          <div className="max-w-2xl">
            <h2 className="kz-display mb-1 text-2xl font-bold text-white">Interface</h2>
            <p className="mb-3 text-sm" style={{ color: 'var(--kz-text-muted)' }}>Shape Home to your taste. Changes apply live.</p>
            <div className="rounded-2xl border px-5" style={{ borderColor: 'var(--kz-border)', background: 'var(--kz-surface-1)' }}>
              <Row title="Hero banner" sub="Featured title showcase on Home"
                control={<Toggle on={ui.hero} onFlip={() => setUiPatch({ hero: !ui.hero })} label="Hero banner" />} />
              <Row title="Continue Watching" sub="Resume row from recent plays"
                control={<Toggle on={ui.continueWatching} onFlip={() => setUiPatch({ continueWatching: !ui.continueWatching })} label="Continue Watching" />} />
              {HOME_RAILS.map((r) => (
                <Row key={r.key} title={r.title} sub={ui.hiddenRails[r.key] ? 'Hidden' : 'Shown on Home'}
                  control={<Toggle on={!ui.hiddenRails[r.key]} onFlip={() => flipRail(r.key)} label={r.title} />} />
              ))}
            </div>
            <p className="mt-3 text-xs" style={{ color: 'var(--kz-text-muted)' }}>Tip: click any row title on Home to minimize it without hiding.</p>
          </div>
        )}

        {tab === 'shortcuts' && (
          <div className="max-w-2xl">
            <h2 className="kz-display mb-1 text-2xl font-bold text-white">Shortcuts</h2>
            <p className="mb-3 text-sm" style={{ color: 'var(--kz-text-muted)' }}>Keyboard control for the desktop shell.</p>
            <ul className="space-y-2 rounded-2xl border p-5 text-sm" style={{ borderColor: 'var(--kz-border)', background: 'var(--kz-surface-1)', color: 'var(--kz-text-secondary)' }}>
              <li><kbd className="rounded border px-2 py-0.5 text-xs">Ctrl+K</kbd> — command palette</li>
              <li><kbd className="rounded border px-2 py-0.5 text-xs">F</kbd> — toggle fullscreen in the player</li>
              <li><kbd className="rounded border px-2 py-0.5 text-xs">Esc</kbd> — close dialogs / exit fullscreen</li>
            </ul>
          </div>
        )}

        {tab === 'about' && (
          <div className="max-w-2xl">
            <h2 className="kz-display mb-1 text-2xl font-bold text-white">About</h2>
            <p className="mb-3 text-sm" style={{ color: 'var(--kz-text-muted)' }}>What this app does under the hood.</p>
            <div className="mb-4 rounded-2xl border p-5" style={{ borderColor: 'var(--kz-border)', background: 'var(--kz-surface-1)' }}>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--kz-text-muted)' }}>
                Kakumei is an anime-first streaming desktop app. The main process rewrites{' '}
                <code>Referer</code>/<code>Origin</code> for gated CDNs so NetMirror streams unlock natively —
                no browser extension needed.
              </p>
            </div>

            <h3 className="kz-display mb-2 text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--kz-text-muted)' }}>Diagnostics</h3>
            <div className="rounded-2xl border p-5" style={{ borderColor: 'var(--kz-border)', background: 'var(--kz-surface-1)' }}>
              <div className="mb-3 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: diag?.health?.ok ? '#34d399' : diag?.health ? '#f87171' : '#fbbf24' }} />
                <p className="text-sm font-semibold text-white">
                  {!diag ? 'Checking backend…' : diag.health?.ok ? `Backend live · up ${Math.floor((diag.health.uptimeSec || 0) / 60)}m` : 'Backend unreachable'}
                </p>
              </div>
              {diag?.health && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {Object.values(diag.health.upstreams || {}).map((u) => (
                    <span key={u.name} className="rounded-lg border px-2.5 py-1 text-[11px] font-semibold"
                      style={{ borderColor: 'var(--kz-border)', color: u.ok ? '#6ee7b7' : '#fca5a5' }}>
                      {u.name} · {u.ok ? `${u.ms}ms` : 'down'}
                    </span>
                  ))}
                  <span className="rounded-lg border px-2.5 py-1 text-[11px] font-semibold text-[var(--kz-text-muted)]" style={{ borderColor: 'var(--kz-border)' }}>
                    {diag.health.sourcesServed} resolves · {diag.health.resolveMiss} misses{diag.health.lastResolveMs != null ? ` · last ${diag.health.lastResolveMs}ms` : ''}
                  </span>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: 'var(--kz-border)' }}>
                <p className="text-xs" style={{ color: 'var(--kz-text-muted)' }}>
                  CDN probe: {diag?.cdns?.updatedAt ? `${new Date(diag.cdns.updatedAt).toLocaleString()} · ${(diag.cdns.hosts || []).filter((h) => h.status === 'live').length}/${(diag.cdns.hosts || []).length} live` : 'never run'}
                </p>
                <button onClick={refreshCdns} disabled={diagBusy}
                  className="ml-auto rounded-lg border px-3 py-1.5 text-xs font-semibold text-[var(--kz-text-secondary)] transition-colors hover:text-white disabled:opacity-50 kz-focus-ring"
                  style={{ borderColor: 'var(--kz-border)' }}>
                  {diagBusy ? 'Probing CDNs… (1–2 min)' : 'Refresh now'}
                </button>
              </div>
              {(diag?.cdns?.hosts || []).map((h) => (
                <p key={h.host} className="mt-1.5 font-mono text-[11px]" style={{ color: h.status === 'live' ? '#6ee7b7' : '#fca5a5' }}>
                  {h.status === 'live' ? '●' : '○'} {h.host} · {h.http ?? 'timeout'} · {h.liveProbes}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
