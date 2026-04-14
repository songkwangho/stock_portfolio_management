'use client';

import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, TrendingUp, Star, Bell, Settings } from 'lucide-react';
import { useAlertStore } from '@/stores/useAlertStore';

const TABS = [
  { path: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { path: '/portfolio', label: '포트폴리오', icon: TrendingUp },
  { path: '/recommendations', label: '추천', icon: Star },
  { path: '/alerts', label: '알림', icon: Bell, hasBadge: true },
  { path: '/settings', label: '설정', icon: Settings },
];

export default function MobileTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const unreadCount = useAlertStore((s) => s.unreadCount);

  return (
    <nav className="fixed bottom-0 left-0 right-0 md:hidden bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/60 z-50">
      <div className="flex items-center justify-around h-16">
        {TABS.map(({ path, label, icon: Icon, hasBadge }) => {
          const active = pathname === path;
          return (
            <button
              key={path}
              onClick={() => router.push(path)}
              className={`flex flex-col items-center justify-center w-full h-full space-y-0.5 transition-colors relative ${
                active ? 'text-blue-400' : 'text-slate-500'
              }`}
            >
              <Icon size={20} />
              {hasBadge && unreadCount > 0 && (
                <span className="absolute top-1 right-1/4 min-w-[16px] h-[16px] bg-red-500 rounded-full text-white text-xs font-bold flex items-center justify-center px-0.5">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
              <span className="text-xs font-bold">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
