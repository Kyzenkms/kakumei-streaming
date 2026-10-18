import { useEffect, useState } from 'react';
import TitlebarSearch from './TitlebarSearch';

// Kakumei desktop titlebar — renders only inside the Electron shell. The bar
// is a drag region; interactive controls opt out with no-drag. Caption
// buttons follow Windows 11 metrics exactly: 32px bar, 46px buttons, 10px
// MDL2-style glyphs, red close hover.
function MinGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M1 8.5h8v1H1z" fill="currentColor" />
    </svg>
  );
}
function MaxGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M1 1h8v8H1z" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
function RestoreGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M3.5 0h6v6h-1V1h-5z" fill="currentColor" />
      <path d="M0.5 3.5h6v6h-6z" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  );
}
function CloseGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

function MenuGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M1.5 3.5h11M1.5 7h11M1.5 10.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function BackGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M7.5 2.5L4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function FwdGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function DesktopTitlebar({ title, onMenu, menuOpen }) {
  const [maximized, setMaximized] = useState(false);
  const [platform, setPlatform] = useState('win32');
  const isDesktop = typeof window !== 'undefined' && window.kakumei?.isDesktop;
  // Desktop-app extras (nav + palette pill) live behind onMenu so the public
  // website titlebar stays untouched. History API drives HashRouter nav with
  // zero hook/context dependence.
  const goBack = () => window.history.back();
  const goFwd = () => window.history.forward();

  useEffect(() => {
    if (!isDesktop) return;
    let unsub = () => {};
    window.kakumei.platform().then(setPlatform).catch(() => {});
    window.kakumei.window.isMaximized().then(setMaximized).catch(() => {});
    unsub = window.kakumei.window.onState((s) => setMaximized(s === 'maximized'));
    return () => unsub();
  }, [isDesktop]);

  if (!isDesktop) return null;
  const isMac = platform === 'darwin';

  // shrink-0 + explicit inline size: flex neighbors (the growing search box)
  // must never squeeze the caption buttons below 46px.
  const ctl = 'relative grid h-full place-items-center shrink-0 text-[var(--kz-text-secondary)] transition-colors duration-75 hover:bg-white/10 hover:text-white active:bg-white/[0.18] active:transition-none kz-focus-ring';
  const ctlSize = { width: 46, height: '100%' };
  const closeCtl = `${ctl} hover:bg-[#C42B1C] active:bg-[#A4261C]`;

  const onBarDoubleClick = (e) => {
    if (e.target.closest('button')) return;
    window.kakumei.window.maximize();
  };

  return (
    <div
      className="sticky top-0 z-[9999] flex h-12 shrink-0 select-none items-stretch justify-between border-b"
      style={{ WebkitAppRegion: 'drag', borderColor: 'var(--kz-border)', background: 'rgba(5,5,9,0.9)', backdropFilter: 'blur(20px) saturate(1.25)' }}
      role="banner"
      onDoubleClick={onBarDoubleClick}
    >
      <div className={`flex min-w-0 flex-1 items-center gap-4 ${isMac ? 'pl-20' : 'pl-5'}`}>
        {onMenu && (
          <button aria-label={menuOpen ? 'Hide sidebar' : 'Show sidebar'} title={menuOpen ? 'Hide sidebar' : 'Show sidebar'}
            onClick={onMenu} style={{ WebkitAppRegion: 'no-drag' }}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--kz-text-secondary)] transition-colors hover:bg-white/10 hover:text-white kz-focus-ring">
            <MenuGlyph />
          </button>
        )}
        <span className="kz-display shrink-0 text-[15px] font-bold tracking-[0.22em] text-[var(--kz-text)]">
          KAKUMEI<span style={{ color: 'var(--kz-accent)' }}>.</span>
        </span>
        {title ? (
          <>
            <span className="h-4 w-px shrink-0" style={{ background: 'var(--kz-border-strong)' }} />
            <span className="truncate text-[14px] font-medium text-[var(--kz-text-secondary)]">{title}</span>
          </>
        ) : null}
        {onMenu && (
          <div className="ml-3 flex min-w-0 flex-1 items-center gap-2" style={{ WebkitAppRegion: 'no-drag' }}>
            <button aria-label="Go back" title="Go back" onClick={goBack}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--kz-text-muted)] transition-colors hover:bg-white/10 hover:text-white kz-focus-ring">
              <BackGlyph />
            </button>
            <button aria-label="Go forward" title="Go forward" onClick={goFwd}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--kz-text-muted)] transition-colors hover:bg-white/10 hover:text-white kz-focus-ring">
              <FwdGlyph />
            </button>
            <TitlebarSearch />
          </div>
        )}
      </div>

      {!isMac && (
        <div className="flex h-full shrink-0 items-stretch" style={{ WebkitAppRegion: 'no-drag' }}>
          <button aria-label="Minimize" title="Minimize" onClick={() => window.kakumei.window.minimize()} className={ctl} style={ctlSize}>
            <MinGlyph />
          </button>
          <button aria-label={maximized ? 'Restore' : 'Maximize'} title={maximized ? 'Restore' : 'Maximize'} onClick={() => window.kakumei.window.maximize()} className={ctl} style={ctlSize}>
            {maximized ? <RestoreGlyph /> : <MaxGlyph />}
          </button>
          <button aria-label="Close" title="Close" onClick={() => window.kakumei.window.close()} className={closeCtl} style={ctlSize}>
            <CloseGlyph />
          </button>
        </div>
      )}
    </div>
  );
}
