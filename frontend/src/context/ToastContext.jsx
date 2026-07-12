import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const toast = useCallback((message, opts = {}) => {
    const id = ++idCounter;
    const type = opts.type || 'info'; // success | error | info
    const duration = opts.duration ?? 4000;
    setToasts((t) => [...t, { id, message, type }]);
    if (duration > 0) {
      timers.current[id] = setTimeout(() => dismiss(id), duration);
    }
    return id;
  }, [dismiss]);

  const api = {
    show: toast,
    success: (msg, opts) => toast(msg, { ...opts, type: 'success' }),
    error: (msg, opts) => toast(msg, { ...opts, type: 'error' }),
    info: (msg, opts) => toast(msg, { ...opts, type: 'info' }),
    dismiss,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        style={{ position: 'fixed', top: 16, right: 16, zIndex: 100 }}
        className="flex flex-col gap-2 w-[92vw] max-w-sm"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            onClick={() => dismiss(t.id)}
            className={`panel cursor-pointer px-4 py-3 text-sm flex items-start gap-2.5 border-l-4 shadow-panel dark:shadow-panel-dark animate-[toast-in_0.18s_ease-out] ${
              t.type === 'success'
                ? 'border-l-signal-transit'
                : t.type === 'error'
                ? 'border-l-signal-alert'
                : 'border-l-signal-route'
            }`}
          >
            <span
              className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                t.type === 'success' ? 'bg-signal-transit' : t.type === 'error' ? 'bg-signal-alert' : 'bg-signal-route'
              }`}
            />
            <span className="flex-1 leading-snug">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
