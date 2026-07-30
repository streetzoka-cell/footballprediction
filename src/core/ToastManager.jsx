// src/core/ToastManager.jsx
import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, AlertTriangle, Info, XCircle, X } from 'lucide-react';

const ToastContext = createContext(null);
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => setToasts((p) => p.filter((t) => t.id !== id)), []);

  const add = useCallback((toast) => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { ...toast, id }]);
    setTimeout(() => remove(id), toast.duration || 4000);
  }, [remove]);

  const value = {
    success: (msg, opts) => add({ type: 'success', message: msg, ...opts }),
    error: (msg, opts) => add({ type: 'error', message: msg, ...opts }),
    info: (msg, opts) => add({ type: 'info', message: msg, ...opts }),
    warning: (msg, opts) => add({ type: 'warning', message: msg, ...opts }),
  };

  const icons = {
    success: <CheckCircle size={18} className="text-emerald-400" />,
    error: <XCircle size={18} className="text-red-400" />,
    warning: <AlertTriangle size={18} className="text-amber-400" />,
    info: <Info size={18} className="text-blue-400" />,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className={`pointer-events-auto bg-[#0a0f1a]/95 border border-white/10 backdrop-blur-xl rounded-xl p-3 flex items-center gap-3 shadow-2xl animate-toast-in`}>
            {icons[t.type]}
            <span className="text-white text-sm font-medium flex-1">{t.message}</span>
            <button onClick={() => remove(t.id)} className="text-slate-500 hover:text-white"><X size={14} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}