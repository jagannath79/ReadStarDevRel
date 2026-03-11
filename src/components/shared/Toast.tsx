'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastContent {
  title: string;
  description?: string;
}

interface Toast {
  id: string;
  type: ToastType;
  content: ToastContent;
}

interface ToastContextValue {
  showToast: (message: string | ToastContent, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string | ToastContent, type: ToastType = 'info') => {
    const content: ToastContent = typeof message === 'string'
      ? { title: message }
      : message;
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, type, content }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const icons: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle className="w-5 h-5 text-emerald-500" />,
    error: <XCircle className="w-5 h-5 text-red-500" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />,
  };

  const borders: Record<ToastType, string> = {
    success: 'border-emerald-200',
    error: 'border-red-200',
    warning: 'border-amber-200',
    info: 'border-blue-200',
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 bg-white/95 backdrop-blur border rounded-xl px-4 py-3 shadow-lg ${borders[toast.type]} min-w-[300px] max-w-sm toast-enter`}
          >
            <div className="pt-0.5">{icons[toast.type]}</div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">{toast.content.title}</p>
              {toast.content.description && (
                <p className="text-xs text-gray-600 mt-0.5">{toast.content.description}</p>
              )}
            </div>
            <button
              onClick={() => dismiss(toast.id)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
