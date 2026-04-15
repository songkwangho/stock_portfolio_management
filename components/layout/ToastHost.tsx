'use client';

import { useToastStore } from '@/stores/useToastStore';

export default function ToastHost() {
  const { toasts, removeToast } = useToastStore();
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-6 right-6 z-[100] space-y-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-5 py-3 rounded-2xl text-sm font-medium shadow-lg ${
            t.type === 'error' ? 'bg-red-500/90 text-white' :
            t.type === 'success' ? 'bg-emerald-500/90 text-white' :
            'bg-blue-500/90 text-white'
          }`}
        >
          <div className="flex items-start gap-3">
            <p className="flex-1 leading-relaxed cursor-pointer" onClick={() => removeToast(t.id)}>{t.message}</p>
            {t.action && (
              <button
                onClick={() => { t.action!.onClick(); removeToast(t.id); }}
                className="shrink-0 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-bold whitespace-nowrap"
              >
                {t.action.label} →
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
