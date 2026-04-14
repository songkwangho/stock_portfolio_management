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
          onClick={() => removeToast(t.id)}
          className={`px-5 py-3 rounded-2xl text-sm font-medium shadow-lg cursor-pointer ${
            t.type === 'error' ? 'bg-red-500/90 text-white' :
            t.type === 'success' ? 'bg-emerald-500/90 text-white' :
            'bg-blue-500/90 text-white'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
