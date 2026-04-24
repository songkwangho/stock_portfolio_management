// 테마 UI 메타데이터 — /themes 페이지와 /stock/[code] 테마 태그에서 공유.
// 서버의 data.js THEMES와 theme_id를 맞춰둔다.

export interface ThemeMeta {
  emoji: string;
  color: string; // Tailwind 색상 이름 (bg/text/border 컴포지션 시 참조)
}

export const THEME_META: Record<string, ThemeMeta> = {
  battery:          { emoji: '⚡', color: 'emerald' },
  ai_semiconductor: { emoji: '🤖', color: 'blue' },
  defense:          { emoji: '🛡️', color: 'slate' },
  bio:              { emoji: '💊', color: 'pink' },
  high_dividend:    { emoji: '💰', color: 'yellow' },
  large_cap:        { emoji: '🏢', color: 'indigo' },
  export:           { emoji: '🌏', color: 'cyan' },
  domestic:         { emoji: '🏪', color: 'orange' },
  green:            { emoji: '🌱', color: 'green' },
  finance:          { emoji: '🏦', color: 'purple' },
};

export const DEFAULT_THEME_META: ThemeMeta = { emoji: '📌', color: 'slate' };

export function getThemeMeta(themeId: string): ThemeMeta {
  return THEME_META[themeId] || DEFAULT_THEME_META;
}
