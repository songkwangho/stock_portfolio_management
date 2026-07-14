import { ReactNode } from 'react';

// 카드 위계는 배경 명도로 표현한다 (DESIGN.md § Elevation).
// - primary: card-raised (slate-800) — 결론·오늘의 액션 등 최우선 정보
// - secondary: card (slate-900) — 차트·지표·뉴스 (기본값)
// - tertiary: inset (slate-950) — 통계 셀·입력창 배경
type Variant = 'primary' | 'secondary' | 'tertiary';

// DESIGN.md § Layout — padding 3단계로만.
type Padding = 'tight' | 'base' | 'emphasis';

type AccentBar = 'positive' | 'negative' | 'neutral';

interface CardProps {
  variant?: Variant;
  padding?: Padding;
  accentBar?: AccentBar | null;
  className?: string;
  children: ReactNode;
}

// DESIGN.md의 rounded.md(12px)는 Tailwind의 rounded-xl에, rounded.sm(8px)은 rounded-lg에
// 매핑된다. --radius-* 토큰을 오버라이드하지 않는 대신 기본 Tailwind 클래스를 그대로 사용.
const VARIANT: Record<Variant, string> = {
  primary: 'bg-card-raised border-border-muted rounded-xl',
  secondary: 'bg-card border-border-subtle rounded-xl',
  tertiary: 'bg-inset border-border-subtle rounded-lg',
};

const PADDING: Record<Padding, string> = {
  tight: 'p-3',
  base: 'p-4',
  emphasis: 'p-6',
};

const ACCENT_BAR: Record<AccentBar, string> = {
  positive: 'border-l-4 border-l-positive',
  negative: 'border-l-4 border-l-negative',
  neutral: 'border-l-4 border-l-slate-500',
};

export default function Card({
  variant = 'secondary',
  padding = 'base',
  accentBar = null,
  className = '',
  children,
}: CardProps) {
  const accent = accentBar ? ACCENT_BAR[accentBar] : '';
  return (
    <div className={`border ${VARIANT[variant]} ${PADDING[padding]} ${accent} ${className}`.trim()}>
      {children}
    </div>
  );
}
