import { Component, useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import DesktopTitlebar from './components/DesktopTitlebar';
import { AuthProvider } from './context/AuthContext';
import { usePersistence } from './hooks/usePersistence';
import { ToastProvider } from './components/Toast';

// True inside the Kakumei Electron shell (window.kakumei is injected by preload).
const IS_DESKTOP = typeof window !== 'undefined' && !!window.kakumei?.isDesktop;

// Lazy-loaded page components
const Home = lazy(() => import('./pages/Home'));
const Discover = lazy(() => import('./pages/Discover'));
const Player = lazy(() => import('./pages/Player'));
const Legal = lazy(() => import('./pages/Legal'));
const Favourites = lazy(() => import('./pages/Favourites'));
const Details = lazy(() => import('./pages/Details'));
const Schedule = lazy(() => import('./pages/Schedule'));
const Anime = lazy(() => import('./pages/Anime'));
const Search = lazy(() => import('./pages/Search'));

function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
    </div>
  );
}

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error('Error:', error, info); }
  render() {
    if (this.state.hasError) return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 16, padding: 24, textAlign: 'center' }}>
        <div style={{ color: '#ef4444' }}>
          <AlertCircle size={64} strokeWidth={1.5} />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#f1f1f3' }}>Something went wrong</h1>
        <p style={{ color: '#71717a', fontSize: 14 }}>{this.state.error?.message}</p>
        <button onClick={() => window.location.reload()}
          style={{ padding: '10px 24px', borderRadius: 12, background: '#a855f7', color: '#fff', fontWeight: 600, border: 'none', cursor: 'pointer', fontSize: 14 }}>
          Reload Page
        </button>
      </div>
    );
    return this.props.children;
  }
}

function AppContent() {
  usePersistence(); // Activate cloud sync
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  // Desktop shell: tag <html> for the anime theme scope and pad for the 40px
  // custom titlebar. No-op on the web (web users never have window.kakumei).
  useEffect(() => {
    if (!IS_DESKTOP) return;
    document.documentElement.classList.add('kyzen-desktop');
    document.body.style.paddingTop = '40px';
    return () => {
      document.documentElement.classList.remove('kyzen-desktop');
      document.body.style.paddingTop = '';
    };
  }, []);

  // Close sidebar on route change
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  return (
    <>
      <DesktopTitlebar title={null} />
      {/* Player page: full width, no sidebar */}
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/play/:type/:id" element={<Player />} />
        <Route path="*" element={
          <div className="flex h-screen overflow-hidden">
            <Sidebar isOpen={isSidebarOpen} onToggle={() => setIsSidebarOpen(!isSidebarOpen)} />
            <main className="flex-1 min-w-0 overflow-y-auto pb-14 lg:pb-0 will-change-scroll">
              <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/"                   element={<Home />} />
                <Route path="/discover/:category" element={<Discover />} />
                <Route path="/details/:type/:id"  element={<Details />} />
                <Route path="/favourites"         element={<Favourites />} />
                <Route path="/anime"              element={<Anime />} />
                <Route path="/search"             element={<Search />} />
                <Route path="/legal"              element={<Legal />} />
                <Route path="/schedule"           element={<Schedule />} />
                <Route path="*"                   element={<Navigate to="/" replace />} />
              </Routes>
              </Suspense>
              <BottomNav onMenuClick={() => setIsSidebarOpen(true)} />
            </main>
          </div>
        } />
      </Routes>
      </Suspense>
    </>
  );
}

function PageFade({ children }) {
  const location = useLocation();
  return (
    <div key={location.pathname} style={{ animation: 'pageFade .22s ease forwards' }}>
      {children}
      <style>{`@keyframes pageFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter basename={import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <AppContent />
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}