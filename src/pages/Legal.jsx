import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  FileText,
  Lock,
  AlertTriangle,
  Mail,
  ChevronRight,
  Play,
  ArrowLeft,
  CheckCircle,
  Scale,
  Eye,
  Server,
  Globe,
  Clock,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const sections = [
  { id: 'dmca', label: 'DMCA', icon: AlertTriangle, color: 'from-red-500 to-orange-500' },
  { id: 'privacy', label: 'Privacy Policy', icon: Lock, color: 'from-violet-500 to-purple-500' },
  { id: 'terms', label: 'Terms of Service', icon: FileText, color: 'from-sky-500 to-blue-500' },
  { id: 'contact', label: 'Contact', icon: Mail, color: 'from-emerald-500 to-teal-500' },
];

export default function Legal() {
  const [active, setActive] = useState('dmca');

  const scrollTo = (id) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden px-5 pt-8 pb-12 sm:px-8">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-900/20 via-zinc-950 to-zinc-950 pointer-events-none" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

        <Link to="/" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors mb-8">
          <ArrowLeft size={16} /> Back to Home
        </Link>

        <div className="relative max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-purple-500/10 border border-purple-500/20 px-4 py-1.5 text-xs font-semibold text-purple-400 mb-4">
            <ShieldCheck size={14} /> Legal &amp; Privacy
          </div>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl mb-4">
            Legal Information
          </h1>
          <p className="text-lg text-zinc-400 max-w-2xl">
            Kakumei is a <span className="text-white font-semibold">free, open-source aggregator</span> that
            indexes third-party streaming sources. We do not host, upload, or store any media content.
          </p>
        </div>

        {/* Quick nav pills */}
        <div className="relative flex flex-wrap gap-2 mt-8">
          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                  active === s.id
                    ? `bg-gradient-to-r ${s.color} text-white shadow-lg`
                    : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon size={14} /> {s.label}
              </button>
            );
          })}
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-5 sm:px-8 space-y-10 pb-24">

        {/* ─── DMCA ─── */}
        <article id="dmca" className="scroll-mt-20 rounded-2xl border border-red-500/20 bg-red-500/5 p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-orange-500 shadow-lg shadow-red-500/25">
              <AlertTriangle size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">DMCA Notice &amp; Takedown Policy</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Last updated: April 2025</p>
            </div>
          </div>

          <div className="prose prose-invert prose-sm max-w-none space-y-5 text-zinc-300">
            <div className="rounded-xl border border-orange-500/20 bg-orange-500/10 p-4 flex gap-3">
              <CheckCircle size={18} className="text-orange-400 mt-0.5 shrink-0" />
              <p className="text-sm text-orange-100">
                <strong>Kakumei does not host, upload, or distribute any copyrighted content.</strong>{' '}
                All streams are provided by independent third-party embed services. We act solely as a
                search and discovery interface.
              </p>
            </div>

            <h3 className="text-base font-semibold text-white flex items-center gap-2"><Scale size={16} className="text-red-400" /> DMCA Compliance</h3>
            <p>
              Kakumei respects the intellectual property rights of others and complies with the
              Digital Millennium Copyright Act (DMCA), 17 U.S.C. § 512. We respond promptly to valid
              takedown notices submitted in accordance with the DMCA.
            </p>

            <h3 className="text-base font-semibold text-white flex items-center gap-2"><FileText size={16} className="text-red-400" /> How to Submit a DMCA Notice</h3>
            <p>
              If you believe that content accessible via this site infringes your copyright, please
              submit a written notice containing <strong>all</strong> of the following elements to our
              designated DMCA agent:
            </p>
            <ol className="list-decimal list-inside space-y-2 text-sm text-zinc-400 pl-2">
              <li>Your physical or electronic signature (or that of your authorized agent).</li>
              <li>Identification of the copyrighted work(s) claimed to be infringed.</li>
              <li>Identification of the material claimed to be infringing with sufficient detail for us to locate it.</li>
              <li>Your contact information (name, address, telephone number, email).</li>
              <li>A statement that you have a good-faith belief that the use is not authorized by the copyright owner.</li>
              <li>A statement, under penalty of perjury, that the information in your notice is accurate and that you are the copyright owner (or authorized to act on their behalf).</li>
            </ol>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex gap-3">
              <Mail size={18} className="text-red-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-white mb-1">DMCA Agent Contact</p>
                <p className="text-sm text-zinc-400">
                  Email:{' '}
                  <a href="mailto:dmca@kakumei.stream" className="text-red-400 hover:text-red-300 transition-colors">
                    dmca@kakumei.stream
                  </a>
                </p>
                <p className="text-xs text-zinc-600 mt-1">
                  We process valid notices within <strong className="text-zinc-400">48–72 hours</strong>.
                </p>
              </div>
            </div>

            <h3 className="text-base font-semibold text-white flex items-center gap-2"><Server size={16} className="text-red-400" /> Counter-Notification</h3>
            <p>
              If you believe material was removed in error, you may submit a counter-notification.
              Counter-notifications must meet the requirements of 17 U.S.C. § 512(g)(3) and are subject
              to legal review. Abuse of the counter-notification process may result in liability for
              damages.
            </p>

            <h3 className="text-base font-semibold text-white flex items-center gap-2"><AlertTriangle size={16} className="text-red-400" /> Repeat Infringers</h3>
            <p>
              Kakumei reserves the right to terminate access for users who repeatedly infringe
              copyright under appropriate circumstances.
            </p>
          </div>
        </article>

        {/* ─── PRIVACY POLICY ─── */}
        <article id="privacy" className="scroll-mt-20 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 shadow-lg shadow-violet-500/25">
              <Lock size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Privacy Policy</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Last updated: April 2025</p>
            </div>
          </div>

          <div className="space-y-5 text-zinc-300 text-sm">
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 p-4 flex gap-3">
              <CheckCircle size={18} className="text-violet-400 mt-0.5 shrink-0" />
              <p className="text-sm text-violet-100">
                <strong>We collect almost no personal data.</strong> We do not require registration, store
                credentials, or sell your information to any third party.
              </p>
            </div>

            <h3 className="text-base font-semibold text-white flex items-center gap-2"><Eye size={16} className="text-violet-400" /> Information We Collect</h3>
            <ul className="space-y-2 pl-2">
              {[
                { label: 'Local Storage', desc: 'Bookmarks, watch history, and user preferences are stored locally in your browser. This data never leaves your device and is not accessible to us.' },
                { label: 'Usage Analytics (Optional)', desc: 'We may collect anonymous, aggregate analytics (page visits, feature usage) to improve the service. No personally identifiable information is collected.' },
                { label: 'Third-party Embeds', desc: 'Embedded streaming players from third-party providers may set their own cookies or collect data. We encourage you to review their respective privacy policies.' },
              ].map(({ label, desc }) => (
                <li key={label} className="flex gap-3">
                  <ChevronRight size={16} className="text-violet-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium text-white">{label}: </span>
                    {desc}
                  </div>
                </li>
              ))}
            </ul>

            <h3 className="text-base font-semibold text-white flex items-center gap-2"><Globe size={16} className="text-violet-400" /> Third-Party Services</h3>
            <p>
              Kakumei uses the{' '}
              <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 transition-colors">
                TMDb API
              </a>{' '}
              to retrieve metadata (titles, posters, descriptions). TMDb's privacy policy governs that
              data. We do not share any user data with TMDb.
            </p>

            <h3 className="text-base font-semibold text-white flex items-center gap-2"><Clock size={16} className="text-violet-400" /> Data Retention</h3>
            <p>
              All locally stored data (bookmarks, history) can be cleared at any time by clearing your
              browser's local storage. We retain no server-side copy of this data.
            </p>

            <h3 className="text-base font-semibold text-white flex items-center gap-2"><ShieldCheck size={16} className="text-violet-400" /> Your Rights</h3>
            <p>
              You have the right to access, correct, or delete any personal information we hold (if any).
              As we store no personal data server-side, there is nothing to request deletion of beyond
              clearing your own browser storage.
            </p>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex gap-3">
              <Mail size={18} className="text-violet-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-white mb-1">Privacy Inquiries</p>
                <a href="mailto:privacy@kakumei.stream" className="text-violet-400 hover:text-violet-300 transition-colors text-sm">
                  privacy@kakumei.stream
                </a>
              </div>
            </div>
          </div>
        </article>

        {/* ─── TERMS OF SERVICE ─── */}
        <article id="terms" className="scroll-mt-20 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-500 shadow-lg shadow-sky-500/25">
              <FileText size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Terms of Service</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Last updated: April 2025</p>
            </div>
          </div>

          <div className="space-y-5 text-zinc-300 text-sm">
            <h3 className="text-base font-semibold text-white">1. Acceptance of Terms</h3>
            <p>
              By accessing or using Kakumei, you agree to be bound by these Terms of Service. If
              you do not agree, please discontinue use immediately.
            </p>

            <h3 className="text-base font-semibold text-white">2. Nature of Service</h3>
            <p>
              Kakumei is an <strong className="text-white">aggregator and discovery platform</strong>.
              We do not produce, host, upload, sell, or distribute any video content. All playback is
              sourced from independent, publicly accessible third-party embed providers.
            </p>

            <h3 className="text-base font-semibold text-white">3. User Responsibilities</h3>
            <ul className="space-y-1 pl-2">
              {[
                'You must be at least 13 years of age to use this service.',
                'You agree not to use the service for any unlawful purpose.',
                'You are solely responsible for your use of any third-party content accessed via this platform.',
                'You will not attempt to circumvent, disable, or interfere with security features.',
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <ChevronRight size={16} className="text-sky-400 mt-0.5 shrink-0" /> {item}
                </li>
              ))}
            </ul>

            <h3 className="text-base font-semibold text-white">4. Disclaimer of Warranties</h3>
            <p>
              The service is provided <strong className="text-white">"as is"</strong> without warranties
              of any kind. We do not guarantee uninterrupted access or the accuracy of third-party
              metadata. Third-party streams may become unavailable at any time without notice.
            </p>

            <h3 className="text-base font-semibold text-white">5. Limitation of Liability</h3>
            <p>
              To the maximum extent permitted by applicable law, Kakumei and its operators shall not
              be liable for any indirect, incidental, special, consequential, or punitive damages arising
              from your use (or inability to use) the service.
            </p>

            <h3 className="text-base font-semibold text-white">6. Changes to Terms</h3>
            <p>
              We reserve the right to modify these terms at any time. Continued use of the service after
              changes constitutes acceptance of the updated terms.
            </p>

            <h3 className="text-base font-semibold text-white">7. Governing Law</h3>
            <p>
              These terms are governed by and construed in accordance with applicable law, without regard
              to conflict of law principles.
            </p>
          </div>
        </article>

        {/* ─── CONTACT ─── */}
        <article id="contact" className="scroll-mt-20 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/25">
              <Mail size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Contact Us</h2>
              <p className="text-xs text-zinc-500 mt-0.5">We typically respond within 48 hours</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: 'General Support', email: 'support@kakumei.stream', desc: 'Questions, bugs, and general inquiries', color: 'text-emerald-400', border: 'border-emerald-500/20' },
              { label: 'DMCA / Legal', email: 'dmca@kakumei.stream', desc: 'Takedown requests and legal matters', color: 'text-red-400', border: 'border-red-500/20' },
              { label: 'Privacy', email: 'privacy@kakumei.stream', desc: 'Privacy concerns and data inquiries', color: 'text-violet-400', border: 'border-violet-500/20' },
            ].map(({ label, email, desc, color, border }) => (
              <div key={email} className={`rounded-xl border ${border} bg-white/5 p-4 flex flex-col gap-2`}>
                <p className={`text-xs font-bold uppercase tracking-wider ${color}`}>{label}</p>
                <a href={`mailto:${email}`} className={`${color} hover:brightness-110 transition-all text-sm font-medium break-all`}>
                  {email}
                </a>
                <p className="text-xs text-zinc-500">{desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-xl border border-white/5 bg-white/5 p-4 text-center">
            <p className="text-sm text-zinc-400">
              This product uses the{' '}
              <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 transition-colors">
                TMDb API
              </a>{' '}
              but is not endorsed or certified by TMDb. Movie/TV data © TMDb.
            </p>
          </div>
        </article>
      </div>

      <Footer />
    </div>
  );
}
