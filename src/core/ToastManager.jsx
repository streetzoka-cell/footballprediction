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
    success: <CheckCircle size={18} />,
    error: <XCircle size={18} />,
    warning: <AlertTriangle size={18} />,
    info: <Info size={18} />,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="zk-toast-container">
        {toasts.map((t) => (
          <div key={t.id} className="zk-toast">
            <span className={`zk-toast-icon zk-toast-icon--${t.type}`}>
              {icons[t.type]}
            </span>
            <div className="zk-toast-body">
              <div className="zk-toast-title">{t.message}</div>
            </div>
            <button onClick={() => remove(t.id)} className="zk-toast-close" aria-label="Close toast">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}