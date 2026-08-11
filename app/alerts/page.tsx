'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { useAlertStore } from '@/stores/useAlertStore';
import { getDataFreshnessShort } from '@/lib/dataFreshness';

// 타입별 "이런 경우 확인해보세요" 가이드 — 알림이 왜 왔는지 이해 + 다음 액션 안내
const ALERT_GUIDES: Record<string, string> = {
  sell_signal: '종목 상세에서 이평선 위치와 지지 구간을 확인해보세요.',
  sma5_break: '단기 흐름이 꺾인 신호예요. 20일 평균선이 지지해주는지 확인해보세요.',
  sma5_touch: '5일 평균선 근처로 내려왔어요. 반등인지 추가 하락인지 거래량을 보세요.',
};

const ALERT_TYPE_LABELS: Record<string, { label: string; color: string; description: string }> = {
  sell_signal: {
    label: '가격 하락 경고', color: 'bg-fall/10 text-fall',
    description: '평단가 대비 7% 넘게 내려왔어요. 이 종목의 재무·수급 분석을 다시 확인해 보세요.',
  },
  sma5_break: {
    label: '단기 하락 알림', color: 'bg-fall/10 text-fall',
    description: '5일 평균 가격 아래로 내려왔어요. 단기 흐름이 약해진 구간이에요.',
  },
  sma5_touch: {
    label: '가격 지지 알림', color: 'bg-rise/10 text-rise',
    description: '5일 평균 가격 근처에서 움직이고 있어요. 단기 평균과 비슷한 수준이에요.',
  },
};

// M4(a) — 목표가 파생 알림 2종(target_near·undervalued)은 트리거를 삭제해 더 이상 생성되지 않는다.
// 다만 기존 DB에 남은 행이 있을 수 있어, 원문 타입 문자열('target_near')이 화면에 새는 것만 막는다.
// ⚠️ 저장된 message 본문에는 여전히 목표가 금액이 적혀 있다 — 완전 제거는 운영자의 DB 정리가 필요:
//    DELETE FROM alerts WHERE type IN ('target_near','undervalued');
const RETIRED_ALERT_TYPES: Record<string, { label: string; color: string; description: string }> = {
  target_near: { label: '지난 알림', color: 'bg-inset text-muted', description: '이 알림 종류는 더 이상 보내지 않아요.' },
  undervalued: { label: '지난 알림', color: 'bg-inset text-muted', description: '이 알림 종류는 더 이상 보내지 않아요.' },
};

export default function AlertsPage() {
  const router = useRouter();
  const { alerts, fetchAlerts, markAllRead, deleteAlert } = useAlertStore();
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    fetchAlerts();
    markAllRead();
    if (typeof window !== 'undefined' && !localStorage.getItem('onboarding_alerts_explained')) {
      setShowGuide(true);
      localStorage.setItem('onboarding_alerts_explained', '1');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-ink">알림</h2>
      {showGuide && (
        <div className="bg-surface border border-line-strong shadow-sm rounded-xl p-5">
          <p className="text-sm font-bold text-ink mb-2">알림은 어떻게 동작하나요?</p>
          {/* M4(a) — 목표가 파생 알림을 제거하면서 watchlist를 훑던 유일한 경로도 함께 사라졌다.
              남은 3종은 전부 보유 종목 전용이라 "보유·관심 종목"은 이제 거짓 서술이다. */}
          <ul className="text-xs text-muted space-y-1.5 leading-relaxed">
            <li>• 보유 종목의 주가가 5일·20일 평균 가격을 오르내리면 알려드려요</li>
            <li>• 하루 1회 갱신이에요 (실시간이 아니에요)</li>
            <li>• 동일 종목당 하루 최대 2건만 전송해요</li>
            <li>• 관심 종목에는 알림이 발생하지 않아요 (보유 종목만)</li>
          </ul>
          <button onClick={() => setShowGuide(false)} className="mt-3 text-xs text-ink font-bold">알겠어요</button>
        </div>
      )}
      {alerts.length === 0 ? (
        <div className="text-center py-16 px-6 bg-inset border border-dashed border-line-strong rounded-xl">
          <p className="text-ink font-bold text-lg">아직 알림이 없어요</p>
          {/* M4(a) — 실제 발생 조건 3종과 문구를 일치시킨다(목표가 근접·저평가 구간은 제거됨). */}
          <p className="text-muted text-sm mt-3 leading-relaxed max-w-md mx-auto">
            보유 종목의 주가가 <span className="text-ink">5일 평균 가격 아래로 내려가거나</span>, <span className="text-ink">5일 평균 근처에서 움직이거나</span>, <span className="text-ink">5일·20일 평균 모두 아래로 내려가면</span> 알려드려요.
          </p>
          <p className="text-faint text-xs mt-3">매일 오전 8시 이후 갱신돼요.</p>
        </div>
      ) : (
        <div className="bg-surface border border-line rounded-xl divide-y divide-line">
          {alerts.map((alert) => {
            const typeInfo = ALERT_TYPE_LABELS[alert.type] || RETIRED_ALERT_TYPES[alert.type]
              || { label: '알림', color: 'bg-inset text-muted', description: '' };
            return (
              <div key={alert.id} className="px-4 py-4">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${typeInfo.color}`}>{typeInfo.label}</span>
                    <span className="text-xs text-ink font-bold">{alert.name}</span>
                    {alert.source === 'holding' && (
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-inset text-muted border border-line">보유 중</span>
                    )}
                    {alert.source === 'watchlist' && (
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-inset text-muted border border-line">관심 종목</span>
                    )}
                  </div>
                  <button onClick={() => deleteAlert(alert.id)} className="flex items-center justify-center min-w-[44px] min-h-[44px] shrink-0 text-faint hover:text-caution transition-colors" aria-label="알림 삭제">
                    <Trash2 size={14} />
                  </button>
                </div>
                {typeInfo.description && (
                  <p className="text-xs text-muted leading-relaxed mb-1">{typeInfo.description}</p>
                )}
                <p className="text-xs text-faint leading-relaxed">{alert.message}</p>
                {ALERT_GUIDES[alert.type] && (
                  <p className="text-xs text-faint mt-2 pr-2 leading-relaxed border-t border-line pt-2 break-keep">
                    {ALERT_GUIDES[alert.type]}
                  </p>
                )}
                <p className="text-xs text-faint mt-1">{getDataFreshnessShort(alert.created_at)}</p>
                <div className="mt-3">
                  <button onClick={() => router.push(`/stock/${alert.code}?from=alerts`)} className="text-xs font-bold px-4 py-2.5 min-h-[44px] inline-flex items-center bg-ink hover:opacity-90 text-surface rounded-lg transition-opacity">
                    지금 확인하기
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
