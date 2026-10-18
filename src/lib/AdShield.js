// ═══════════════════════════════════════════════════════════════════════════
//  Kakumei AdShield v4 — Client-Side Clickjack & Popup Defense System
//
//  Layers:
//    1. window.open hijack          — kills all popup windows instantly
//    2. window.focus / blur guard   — refocuses after iframe steals focus
//    3. Transparent overlay patrol  — MutationObserver nukes invisible divs
//    4. Anchor click interceptor    — cancels target="_blank" / external links
//    5. postMessage filter          — blocks redirect messages from iframes
//    6. beforeunload guard          — prevents navigation away
//    7. Pointer-events kill layer   — blocks invisible click-through elements
//    8. history.pushState guard     — blocks iframe-triggered navigation
//    9. document.write nullification — kills inline ad script injection
//   10. Timed DOM sweep             — periodic cleanup of re-injected overlays
// ═══════════════════════════════════════════════════════════════════════════

const SHIELD_LOG = '[KakumeiShield]';

// ── Domains that are ALLOWED to open in new tabs (e.g. TMDb, player, etc.)
const ALLOWED_ORIGINS = new Set([
  'player.videasy.net',
  'vidsrc.xyz', 'vidsrc.pm', 'vidsrc.to', 'vidsrc.cc',
  'themoviedb.org', 'image.tmdb.org',
]);

function isAllowedOrigin(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return ALLOWED_ORIGINS.has(host) || host.endsWith('.videasy.net');
  } catch { return false; }
}

// ── 1. Transparent / Click-Hijacking Overlay Killer ──────────────────────────
function isInvisibleOverlay(el) {
  if (!(el instanceof HTMLElement)) return false;
  const s = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();

  // Must be positioned and cover a big area
  if (rect.width < 200 || rect.height < 200) return false;

  const isFixed = s.position === 'fixed' || s.position === 'absolute';
  const isTransparent =
    parseFloat(s.opacity) < 0.05 ||
    s.backgroundColor === 'transparent' ||
    s.backgroundColor === 'rgba(0, 0, 0, 0)' ||
    s.background === 'transparent';
  const hasHighZ = parseInt(s.zIndex, 10) > 100;
  const isClickable = s.cursor === 'pointer' || el.tagName === 'A' || el.onclick != null;
  const coversViewport = rect.width > window.innerWidth * 0.5 && rect.height > window.innerHeight * 0.5;
  const isClickThrough = s.pointerEvents !== 'none';

  return isFixed && (isTransparent || parseFloat(s.opacity) < 0.15) && hasHighZ && coversViewport && isClickThrough;
}

function killOverlays() {
  const candidates = document.querySelectorAll(
    'div[style*="position:fixed"], div[style*="position: fixed"],' +
    'div[style*="z-index"], a[style*="position"],' +
    'span[style*="position:fixed"], iframe[style*="position:fixed"]'
  );
  let killed = 0;
  candidates.forEach(el => {
    if (isInvisibleOverlay(el)) {
      console.log(SHIELD_LOG, '🗑 Killing overlay:', el);
      el.remove();
      killed++;
    }
  });
  // Also kill known ad iframe patterns
  document.querySelectorAll('iframe').forEach(el => {
    const src = (el.src || '').toLowerCase();
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const isHidden = parseFloat(style.opacity) < 0.1 || style.visibility === 'hidden' || (rect.width < 2 && rect.height < 2);
    const isSuspicious =
      src.includes('ads') || src.includes('popup') || src.includes('track') ||
      src.includes('click') || src.includes('banner') || (src !== '' && !isAllowedOrigin(src) && isHidden);

    if (isSuspicious) {
      console.log(SHIELD_LOG, '🗑 Killing ad iframe:', el.src);
      el.remove();
      killed++;
    }
  });
  return killed;
}

// ── 2. MutationObserver — Continuous DOM Patrol ───────────────────────────────
function startDOMPatrol() {
  const observer = new MutationObserver((mutations) => {
    let needsSweep = false;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue; // elements only

        const tag = node.tagName?.toUpperCase();

        // Kill injected ad scripts
        if (tag === 'SCRIPT') {
          const src = node.src?.toLowerCase() || '';
          const inline = node.textContent || '';
          const isSuspicious =
            /popunder|popup|adsterra|propeller|exoclick|clickadu|zoneb|ouo|adf\.ly|linkvertise/i.test(src) ||
            /window\.open|popunder|pop-under|adpop|clickjack/i.test(inline);
          if (isSuspicious) {
            console.log(SHIELD_LOG, '🗑 Removing ad script:', src || 'inline');
            node.remove();
            continue;
          }
        }

        // Mark for overlay sweep
        if (tag === 'DIV' || tag === 'A' || tag === 'SPAN' || tag === 'IFRAME') {
          needsSweep = true;
        }
      }
    }
    if (needsSweep) {
      requestAnimationFrame(killOverlays);
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: false,
  });

  return () => observer.disconnect();
}

// ── 3. window.open hijack ─────────────────────────────────────────────────────
function hijackWindowOpen(onBlocked) {
  const originalOpen = window.open;
  window.open = function (url, ...args) {
    if (url && isAllowedOrigin(url)) {
      return originalOpen.call(window, url, ...args);
    }
    console.log(SHIELD_LOG, '🚫 window.open blocked:', url);
    onBlocked?.('popup');
    // Return a fake window object so error handlers don't blow up
    return {
      closed: true,
      close() {},
      focus() {},
      blur() {},
      location: { href: url || '', assign() {}, replace() {} },
      document: { write() {}, writeln() {}, open() {}, close() {} },
    };
  };
  return () => { window.open = originalOpen; };
}

// ── 4. Focus/Blur guard — regain focus after iframe click-steal ───────────────
function installFocusGuard(onBlocked) {
  let guardActive = true;
  let lastFocusTime = 0;

  const onBlur = () => {
    if (!guardActive) return;
    const now = Date.now();
    // Debounce rapid blur events
    if (now - lastFocusTime < 200) return;
    lastFocusTime = now;

    // Small delay — let the browser register the click, then yank focus back
    setTimeout(() => {
      if (document.hidden) return; // Tab switch — don't fight it
      window.focus();
      onBlocked?.('focus-steal');
    }, 50);
  };

  window.addEventListener('blur', onBlur, { passive: true });
  return () => {
    guardActive = false;
    window.removeEventListener('blur', onBlur);
  };
}

// ── 5. Anchor / click interceptor ────────────────────────────────────────────
function installClickInterceptor(onBlocked) {
  const handler = (e) => {
    const anchor = e.target.closest('a');
    if (!anchor) return;

    const href = anchor.href || '';
    const target = anchor.target || '';

    // Block external links with target (new tab attempts)
    if (target === '_blank' || target === '_top' || target === '_parent') {
      if (href && !isAllowedOrigin(href) && !href.startsWith(window.location.origin)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        console.log(SHIELD_LOG, '🚫 Anchor hijack blocked:', href);
        onBlocked?.('anchor');
        return;
      }
    }

    // Block known ad/redirect patterns in href
    if (/ouo\.io|adf\.ly|linkvertise|shorte\.st|bc\.vc|exe\.io|shrinkme/i.test(href)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      console.log(SHIELD_LOG, '🚫 Redirect link blocked:', href);
      onBlocked?.('redirect-link');
    }
  };

  document.addEventListener('click', handler, true);
  document.addEventListener('auxclick', handler, true); // Middle-click
  return () => {
    document.removeEventListener('click', handler, true);
    document.removeEventListener('auxclick', handler, true);
  };
}

// ── 6. postMessage filter — blocks iframe redirect attempts ───────────────────
const ALLOWED_MESSAGE_ORIGINS = new Set([
  'https://player.videasy.net',
  'https://vidsrc.fyi',
  'https://www.youtube.com',
]);

function installPostMessageFilter(onBlocked) {
  const handler = (event) => {
    // Only accept messages from whitelisted origins
    if (!ALLOWED_MESSAGE_ORIGINS.has(event.origin)) {
      console.log(SHIELD_LOG, '🚫 postMessage blocked from non-whitelisted origin:', event.origin);
      event.stopImmediatePropagation();
      onBlocked?.('postmessage');
      return;
    }

    const data = event.data;
    if (!data || (typeof data !== 'object' && typeof data !== 'string')) return;

    const str = typeof data === 'string' ? data : JSON.stringify(data);

    // Even from allowed origins, block messages with navigation patterns
    if (/navigate|redirect|window\.open|clickjack/i.test(str)) {
      console.log(SHIELD_LOG, '🚫 postMessage with nav pattern blocked from:', event.origin, '| data:', str.slice(0, 100));
      event.stopImmediatePropagation();
      onBlocked?.('postmessage');
    }
  };

  window.addEventListener('message', handler, true);
  return () => window.removeEventListener('message', handler, true);
}

// ── 7. beforeunload guard ─────────────────────────────────────────────────────
function installBeforeUnloadGuard() {
  const handler = (e) => {
    e.preventDefault();
    e.returnValue = '';
    console.log(SHIELD_LOG, '⚠ beforeunload intercepted');
  };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}

// ── 8. history.pushState / replaceState guard ─────────────────────────────────
function installHistoryGuard() {
  const _push = history.pushState.bind(history);
  const _replace = history.replaceState.bind(history);

  const guard = (fn) => function (state, title, url) {
    if (url && typeof url === 'string') {
      try {
        const u = new URL(url, window.location.origin);
        // Block if trying to navigate to a completely different origin
        if (u.origin !== window.location.origin) {
          console.log(SHIELD_LOG, '🚫 history navigation blocked:', url);
          return;
        }
      } catch {}
    }
    return fn(state, title, url);
  };

  history.pushState = guard(_push);
  history.replaceState = guard(_replace);

  return () => {
    history.pushState = _push;
    history.replaceState = _replace;
  };
}

// ── 9. document.write nullification ──────────────────────────────────────────
function nullifyDocumentWrite() {
  const _write = document.write.bind(document);
  const _writeln = document.writeln.bind(document);

  // Only block if it looks like an ad injection
  document.write = function (html) {
    if (/ads?|popup|popunder|banner|iframe.*src/i.test(html)) {
      console.log(SHIELD_LOG, '🚫 document.write blocked (ad content)');
      return;
    }
    return _write(html);
  };
  document.writeln = function (html) {
    if (/ads?|popup|popunder|banner|iframe.*src/i.test(html)) {
      console.log(SHIELD_LOG, '🚫 document.writeln blocked (ad content)');
      return;
    }
    return _writeln(html);
  };

  return () => {
    document.write = _write;
    document.writeln = _writeln;
  };
}

// ── 10. Timed sweep — kill re-injected overlays every 500ms ──────────────────
function startTimedSweep() {
  const id = setInterval(() => {
    const killed = killOverlays();
    if (killed > 0) console.log(SHIELD_LOG, `🧹 Timed sweep removed ${killed} overlay(s)`);
  }, 500);
  return () => clearInterval(id);
}

// ── Master Install / Uninstall ────────────────────────────────────────────────

/**
 * Install all shield layers.
 * @param {(type: string) => void} onBlocked  Callback fired when something is blocked
 * @returns {() => void}  Cleanup function — call in useEffect return
 */
export function installAdShield(onBlocked) {
    console.log(SHIELD_LOG, '🛡 Activating KakumeiShield v4…');

  // Initial sweep
  requestAnimationFrame(killOverlays);

  const teardowns = [
    hijackWindowOpen(onBlocked),
    installFocusGuard(onBlocked),
    installClickInterceptor(onBlocked),
    installPostMessageFilter(onBlocked),
    installBeforeUnloadGuard(),
    installHistoryGuard(),
    nullifyDocumentWrite(),
    startDOMPatrol(),
    startTimedSweep(),
  ];

  return () => {
    console.log(SHIELD_LOG, '🔓 Deactivating KakumeiShield…');
    teardowns.forEach(fn => fn?.());
  };
}

// ── Service Worker Unregistration (Clean up any active service workers) ─────
export async function registerShieldSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const reg of registrations) {
      // Don't unregister our own CDN Referer SW (served from /sw.js)
      if (reg.scope && reg.scope === location.origin + '/') continue;
      await reg.unregister();
      console.log(SHIELD_LOG, '🧹 Unregistered service worker:', reg.scope);
    }
  } catch (err) {
    console.error(SHIELD_LOG, 'SW unregister failed:', err);
  }
}
