import { createContext, useContext, useState, useCallback, useRef } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

const ToastCtx = createContext(null);
export function useToast() { return useContext(ToastCtx); }

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const show = useCallback((message, { type = "info", duration = 3000 } = {}) => {
    const id = ++idRef.current;
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration);
  }, []);

  const dismiss = useCallback((id) => setToasts(t => t.filter(x => x.id !== id)), []);

  const icons = {
    success: <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />,
    error:   <AlertCircle  size={15} className="text-red-400 shrink-0" />,
    info:    <Info         size={15} className="text-purple-400 shrink-0" />,
  };

  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border border-white/10 shadow-2xl text-[13px] font-semibold text-zinc-100 max-w-[calc(100vw-32px)] whitespace-nowrap"
            style={{ background: "rgba(13,15,26,0.97)", backdropFilter: "blur(20px)", animation: "toastIn .3s cubic-bezier(.22,1,.36,1) forwards" }}>
            {icons[t.type]}
            <span className="overflow-hidden text-ellipsis">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="ml-1 text-zinc-500 hover:text-white transition-colors"><X size={13}/></button>
          </div>
        ))}
      </div>
      <style>{`@keyframes toastIn{from{opacity:0;transform:translateY(10px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>
    </ToastCtx.Provider>
  );
}
