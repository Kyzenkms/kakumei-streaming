import { Scales, ShieldCheck, Eye, Scroll } from '@phosphor-icons/react';

const TABS = [
  { id: 'dmca', label: 'DMCA' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'terms', label: 'Terms' },
  { id: 'contact', label: 'Contact' },
];

export default function Legal() {
  return (
    <div className="h-full overflow-y-auto px-10 py-6">
      <div className="mb-6 flex items-center gap-3"><Scales size={28} style={{ color: 'var(--kz-accent)' }} /><div><h1 className="kz-display text-3xl font-bold text-white">Legal</h1><p className="text-sm text-[var(--kz-text-muted)]">DMCA, privacy, terms and contact.</p></div></div>

      <nav className="mb-8 flex gap-2">
        {TABS.map(t => <a key={t.id} href={`#${t.id}`} className="rounded-full border border-[var(--kz-border)] px-4 py-1.5 text-[12px] font-medium text-[var(--kz-text-muted)] no-underline transition-colors hover:text-white">{t.label}</a>)}
      </nav>

      <article id="dmca" className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/5 p-6">
        <h2 className="mb-2 flex items-center gap-2 kz-display text-lg font-semibold text-white"><ShieldCheck size={18} className="text-red-400" /> DMCA Notice & Takedown Policy</h2>
        <p className="text-sm leading-relaxed text-[var(--kz-text-secondary)]">Kakumei is a metadata aggregator. We do not host, store, or distribute copyrighted content. Streams are provided by third-party sources; rights holders may request removal via dmca@kakumei.stream with the relevant URLs.</p>
      </article>

      <article id="privacy" className="mb-6 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-6">
        <h2 className="mb-2 flex items-center gap-2 kz-display text-lg font-semibold text-white"><Eye size={18} className="text-violet-400" /> Privacy Policy</h2>
        <p className="text-sm leading-relaxed text-[var(--kz-text-secondary)]">Local bookmarks, watch history, and likes stay in your browser/Electron profile. Optional cloud sync uses Firebase only when you sign in. We do not sell personal data.</p>
      </article>

      <article id="terms" className="mb-6 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-6">
        <h2 className="mb-2 flex items-center gap-2 kz-display text-lg font-semibold text-white"><Scroll size={18} className="text-sky-400" /> Terms of Service</h2>
        <p className="text-sm leading-relaxed text-[var(--kz-text-secondary)]">You agree to use Kakumei lawfully and only to access content you have rights to. The service is provided "as is" without warranties. Availability depends on third-party sources and may change.</p>
      </article>

      <article id="contact" className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6">
        <h2 className="mb-2 kz-display text-lg font-semibold text-white">Contact Us</h2>
        <p className="text-sm text-[var(--kz-text-secondary)]">DMCA / Legal: dmca@kakumei.stream · Support: support@kakumei.stream</p>
      </article>
    </div>
  );
}
