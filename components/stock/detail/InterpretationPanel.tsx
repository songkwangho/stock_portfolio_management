'use client';

import { synthesize, type Interpretation } from '@/lib/stockDetail/interpret';

// 4.5c차 — [요약] 탭 해석 패널. 각 지표를 초보자 언어로 풀이 + 종합(상충/판단 유보).
// 역할 분리: 결론 카드=한 줄 결론 / 이 패널=왜 그런지 근거 / 종합점수=수치.
//
// tone 색은 UI에 쓰지 않는다(무채색) — 항목에 positive/caution 색을 칠하면 "긍정=사라"로
// 오독될 수 있어서. tone은 종합(synthesize)의 상충 집계에만 쓰고, 화면은 레이블 muted + 풀이 ink.
// (3.13 규칙: 방향색은 가격 방향에만.)

export default function InterpretationPanel({ interps }: { interps: Interpretation[] }) {
  const avail = interps.filter(x => x.available);
  if (avail.length === 0) return null;   // 전 항목 데이터 없으면 패널 미표시
  return (
    <div className="bg-surface border border-line rounded-xl p-4">
      <h3 className="text-sm font-bold text-ink mb-3">현재 이렇게 보고 있어요</h3>
      <div className="space-y-2.5">
        {avail.map(it => (
          <div key={it.key} className="flex gap-3">
            <span className="shrink-0 w-10 text-xs font-bold text-muted pt-0.5">{it.label}</span>
            <p className="flex-1 text-sm text-ink leading-relaxed break-keep">{it.text}</p>
          </div>
        ))}
      </div>
      {/* 종합 블록 — surface(#FFF) 위에 paper(#FAFAF8) inset을 깔아 명도만으로 "근거 → 종합" 위계.
          색(tone/방향색) 미사용 (3.13: 방향색은 가격 방향에만). */}
      <div className="mt-3 bg-paper rounded-lg px-3 py-2">
        <p className="text-sm text-ink leading-relaxed break-keep">{synthesize(interps)}</p>
      </div>
      <p className="text-xs text-faint mt-2 break-keep">
        ※ 데이터를 초보자가 이해하기 쉽게 풀어드린 거예요. 투자 판단은 직접 하시고, 거래는 증권사 앱에서 진행하세요.
      </p>
    </div>
  );
}
