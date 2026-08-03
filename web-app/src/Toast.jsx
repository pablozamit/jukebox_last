import { createContext, useContext, useState, useCallback } from 'react';
import { X, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { useTheme } from './ThemeContext';

const ToastContext = createContext();

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const { theme } = useTheme();
  const isCatrina = theme === 'catrina';

  const addToast = useCallback((message, type = 'info', duration = 3500) => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const icons = {
    error: <AlertTriangle size={16} />,
    success: <CheckCircle size={16} />,
    info: <Info size={16} />,
  };

  const typeStyles = {
    error: isCatrina
      ? 'border-red-900/40 bg-red-950/60 text-red-300'
      : 'border-red-500/30 bg-red-500/10 text-red-400',
    success: isCatrina
      ? 'border-brand-gold/40 bg-brand-gold/10 text-brand-gold'
      : 'border-brand-neon-green/30 bg-brand-neon-green/10 text-brand-neon-green',
    info: isCatrina
      ? 'border-brand-gold/30 bg-[#141210] text-brand-gold/80'
      : 'border-brand-neon-purple/30 bg-brand-neon-purple/10 text-brand-neon-purple',
  };

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className="fixed bottom-20 left-0 right-0 z-[200] flex flex-col items-center gap-2 px-4 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium shadow-lg backdrop-blur-md max-w-sm w-full animate-[slideUp_0.3s_ease-out] ${typeStyles[t.type]}`}
          >
            <span className="shrink-0">{icons[t.type]}</span>
            <span className="flex-1">{t.message}</span>
            <button onClick={() => removeToast(t.id)} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
