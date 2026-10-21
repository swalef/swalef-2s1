import { createContext, useContext, useState, useCallback } from 'react';
import { IconCheck, IconX } from '../components/Icons';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 3500) => {
    // Strip any residual emojis if any slipped into the message
    const cleanMessage = typeof message === 'string'
      ? message.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim()
      : message;

    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message: cleanMessage, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="toast-container">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`toast toast-${toast.type}`}
            onClick={() => removeToast(toast.id)}
            style={{ cursor: 'pointer' }}
          >
            <span style={{ display: 'flex', alignItems: 'center' }}>
              {toast.type === 'success' ? (
                <IconCheck size={16} />
              ) : toast.type === 'error' ? (
                <IconX size={16} />
              ) : (
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-secondary)' }} />
              )}
            </span>
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  return ctx?.addToast || (() => {});
}
