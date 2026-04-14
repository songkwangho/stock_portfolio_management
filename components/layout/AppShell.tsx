'use client';

import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import MobileTabBar from './MobileTabBar';
import HealthGate from './HealthGate';
import HeaderBar from './HeaderBar';
import DisclaimerModal from './DisclaimerModal';
import ToastHost from './ToastHost';
import { usePortfolioStore } from '@/stores/usePortfolioStore';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [nickname, setNickname] = useState('');
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setNickname(localStorage.getItem('nickname') || '');
  }, []);

  useEffect(() => {
    if (isReady) usePortfolioStore.getState().fetchHoldings();
  }, [isReady]);

  const syncWarning = (() => {
    if (!isReady) return null;
    if (!lastSync) return '아직 데이터를 수집 중이에요. 잠시 기다려 주세요.';
    const ageMs = Date.now() - new Date(lastSync).getTime();
    if (ageMs > 24 * 60 * 60 * 1000) return '데이터가 오늘 갱신되지 않았어요. 최신 시세가 아닐 수 있어요.';
    return null;
  })();

  return (
    <HealthGate onReady={(ls) => { setLastSync(ls); setIsReady(true); }}>
      <div className="flex h-screen bg-slate-950 text-slate-50 overflow-hidden font-sans">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/5 blur-[120px] rounded-full -mr-48 -mt-48 pointer-events-none"></div>
          <HeaderBar nickname={nickname} />
          {syncWarning && (
            <div className="px-4 md:px-10 py-2 bg-amber-500/5 border-b border-amber-500/20">
              <p className="text-xs text-amber-300/80 max-w-7xl mx-auto">ℹ️ {syncWarning}</p>
            </div>
          )}
          <main className="flex-1 overflow-auto p-4 md:p-10 relative">
            <div className="max-w-7xl mx-auto pb-24 md:pb-20">
              {children}
            </div>
          </main>
        </div>
        <MobileTabBar />
        <DisclaimerModal />
        <ToastHost />
      </div>
    </HealthGate>
  );
}
