import { ReactNode } from 'react';

// 카드 위계는 면·그림자로 표현한다 (DESIGN.md § Elevation, 3.13 라이트).
// - primary: surface + line-strong 테두리 + shadow-sm — 히어로·결론 카드
// - secondary: surface + line 테두리 — 차트·지표·신호 (기본값)
// - tertiary: inset(paper와 동일면) + 테두리 없음 — 통계 셀·함몰 영역
type Variant = 'primary' | 'secondary' | 'tertiary';

// DESIGN.md § Layout — padding 3단계로만.
type Padding = 'tight' | 'base' | 'emphasis';

// accentBar 값은 의미(긍정/부정/중립) 기준. 한국 증시 관습으로 긍정=rise(빨강)·부정=fall(파랑).
type AccentBar = 'positive' | 'negative' | 'neutral';

interface CardProps {
  variant?: Variant;
  padding?: Padding;
  accentBar?: AccentBar | null;
  className?: string;
  children: ReactNode;
}

const VARIANT: Record<Variant, string> = {
  primary: 'bg-surface border border-line-strong shadow-sm rounded-xl',
  secondary: 'bg-surface border border-line rounded-xl',
  tertiary: 'bg-inset rounded-lg',
};

const PADDING: Record<Padding, string> = {
  tight: 'p-3',
  base: 'p-4',
  emphasis: 'p-6',
};

const ACCENT_BAR: Record<AccentBar, string> = {
  positive: 'border-l-4 border-l-rise',
  negative: 'border-l-4 border-l-fall',
  neutral: 'border-l-4 border-l-line-strong',
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
    <div className={`${VARIANT[variant]} ${PADDING[padding]} ${accent} ${className}`.trim()}>
      {children}
    </div>
  );
}
