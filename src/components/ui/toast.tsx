"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { CheckCircle2, X } from "lucide-react";

type ToastMessage = { id: number; message: string };
const ToastContext = createContext<{
  showToast: (message: string) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const showToast = useCallback((message: string) => {
    const id = Date.now();
    setMessages((current) => [...current, { id, message }]);
    window.setTimeout(
      () => setMessages((current) => current.filter((item) => item.id !== id)),
      4_000,
    );
  }, []);
  const value = useMemo(() => ({ showToast }), [showToast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-20 right-4 z-50 space-y-2 md:bottom-4"
      >
        {messages.map((item) => (
          <div
            key={item.id}
            className="flex max-w-sm items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg"
          >
            <CheckCircle2 className="size-4 text-emerald-400" />
            <span className="flex-1">{item.message}</span>
            <button
              onClick={() =>
                setMessages((current) =>
                  current.filter((message) => message.id !== item.id),
                )
              }
              aria-label="Dismiss notification"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
