'use client';

import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

interface NavButtonProps {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}

const NavButton = ({ active, onClick, icon, label }: NavButtonProps) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center space-x-3.5 px-5 py-3 rounded-lg transition-colors ${active
      ? 'bg-ink text-surface'
      : 'text-muted hover:text-ink hover:bg-inset'
      }`}
  >
    <span className={active ? 'text-surface' : 'text-faint'}>{icon}</span>
    <span className="font-bold text-sm tracking-tight">{label}</span>
    {active && <ChevronRight size={14} className="ml-auto opacity-60" />}
  </button>
);

export default NavButton;
