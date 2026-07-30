'use client';

import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, TrendingUp, Star, Eye, Filter, Layers, Settings, Sparkles, ClipboardList } from 'lucide-react';
import NavButton from '@/components/ui/NavButton';

const MENU = [
  { path: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { path: '/portfolio', label: '내 포트폴리오', icon: TrendingUp },
  { path: '/recommendations', label: '유망 종목 추천', icon: Star },
  { path: '/watchlist', label: '관심종목', icon: Eye },
  { path: '/themes', label: '테마 탐색', icon: Sparkles },
  { path: '/screener', label: '종목 스크리너', icon: Filter },
  { path: '/stocks', label: '주요 종목 현황', icon: Layers },
  { path: '/journal', label: '거래 진단', icon: ClipboardList },
  { path: '/settings', label: '설정', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside className="hidden md:flex w-68 border-r border-line flex-col bg-surface">
      <div className="p-8">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">StockAnalyzer</h1>
      </div>

      <nav className="flex-1 px-4 space-y-1.5">
        {MENU.map(({ path, label, icon: Icon }) => {
          const active = pathname === path || (path !== '/dashboard' && pathname.startsWith(path));
          return (
            <NavButton
              key={path}
              active={active}
              onClick={() => router.push(path)}
              icon={<Icon size={20} />}
              label={label}
            />
          );
        })}
      </nav>
    </aside>
  );
}
