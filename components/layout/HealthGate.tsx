'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Zap } from 'lucide-react';
import { API_BASE_URL } from '@/lib/stockApi';

type HealthState = 'checking' | 'ok' | 'timeout';

interface Props {
  children: React.ReactNode;
  onReady?: (lastSync: string | null) => void;
}

const TIMEOUT_MS = 25000; // Render cold start 대응 (첫 요청 30~50초 → 재시도 1회 포함 여유)

export default function HealthGate({ children, onReady }: Props) {
  const [healthState, setHealthState] = useState<HealthState>('checking');

  const checkHealth = () => {
    setHealthState('checking');
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      setHealthState('timeout');
    }, TIMEOUT_MS);

    fetch(`${API_BASE_URL}/health`, { signal: controller.signal })
      .then((r) => r.json())
      .then((body: { lastSync?: string | null }) => {
        clearTimeout(timer);
        onReady?.(body?.lastSync || null);
        setHealthState('ok');
      })
      .catch((err: Error) => {
        clearTimeout(timer);
        if (err.name !== 'AbortError') setHealthState('timeout');
      });

    return () => { clearTimeout(timer); controller.abort(); };
  };

  useEffect(() => {
    const cleanup = checkHealth();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (healthState === 'ok') return <>{children}</>;

  return (
    <div className="flex h-screen bg-slate-950 text-slate-50 items-center justify-center font-sans p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex items-center justify-center">
          <span className="bg-blue-600 p-3 rounded-2xl"><Zap size={28} fill="white" color="white" /></span>
        </div>
        <h1 className="text-2xl font-extrabold">StockAnalyzer</h1>
        {healthState === 'checking' ? (
          <>
            <div className="flex items-center justify-center text-slate-400">
              <RefreshCw className="animate-spin mr-2" size={18} />
              <span className="text-sm">데이터를 불러오는 중이에요...</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              처음 접속할 땐 준비 시간이 필요해요. (보통 30초 이내)<br />
              커피 한 모금 하고 오셔도 괜찮아요 ☕
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-300 leading-relaxed">
              서버가 아직 깨어나는 중이에요.
            </p>
            <p className="text-xs text-slate-500 leading-relaxed">
              잠시 후 <span className="font-bold text-slate-300">다시 시도</span>를 눌러주세요.<br />
              (무료 서버 특성상 첫 접속 시 시간이 걸릴 수 있어요.)
            </p>
            <button
              onClick={checkHealth}
              className="px-6 py-3 min-h-[44px] bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-2xl transition-colors inline-flex items-center space-x-2"
            >
              <RefreshCw size={14} />
              <span>다시 시도</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
