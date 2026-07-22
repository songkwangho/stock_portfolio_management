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
  target_near: '목표가에 가까워졌어요. 실제 거래는 증권사 앱에서 직접 해주세요.',
  undervalued: '지표상 저평가 구간이에요. 기업 뉴스도 함께 확인해보세요.',
};

const ALERT_TYPE_LABELS: Record<string, { label: string; color: string; description: string }> = {
  sell_signal: {
    label: '가격 하락 경고', color: 'bg-fall/10 text-fall',
    description: '평단가 대비 -7% 이상 하락해 손절 기준에 닿았어요. 분석을 다시 확인해 보세요.',
  },
  sma5_break: {
    label: '단기 하락 알림', color: 'bg-fall/10 text-fall',
    description: '5일 평균선 아래로 떨어졌어요. 단기 하락 흐름일 수 있으니 추세를 지켜보세요.',
  },
  sma5_touch: {
    label: '가격 지지 알림', color: 'bg-rise/10 text-rise',
    description: '5일 평균선 근처에서 지지받고 있어요. 반등 가능 구간일 수 있어요.',
  },
  target_near: {
    label: '목표가 근접 알림', color: 'bg-caution/10 text-caution',
    description: '애널리스트 목표가에 가까워졌어요. 차익 실현 시점을 고민해 볼 때예요.',
  },
  undervalued: {
    label: '저평가 분석 결과', color: 'bg-rise/10 text-rise',
    description: '밸류에이션·지표상 저평가 구간으로 분석됐어요. 상세 분석을 확인해 보세요.',
  },
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
          <ul className="text-xs text-muted space-y-1.5 leading-relaxed">
            <li>• 보유·관심 종목에 주요 변화가 생기면 알려드려요</li>
            <li>• 하루 1회 갱신이에요 (실시간이 아니에요)</li>
            <li>• 동일 종목당 하루 최대 2건만 전송해요</li>
            <li>• 이평선 관련 알림은 보유 종목에만 발생해요</li>
          </ul>
          <button onClick={() => setShowGuide(false)} className="mt-3 text-xs text-ink font-bold">알겠어요</button>
        </div>
      )}
      {alerts.length === 0 ? (
        <div className="text-center py-16 px-6 bg-inset border border-dashed border-line-strong rounded-xl">
          <p className="text-ink font-bold text-lg">아직 알림이 없어요</p>
          <p className="text-muted text-sm mt-3 leading-relaxed max-w-md mx-auto">
            보유·관심 종목에 <span className="text-ink">5일 평균선 이탈</span>, <span className="text-ink">목표가 근접</span>, <span className="text-ink">저평가 구간 진입</span> 등이 감지되면 알려드려요.
          </p>
          <p className="text-faint text-xs mt-3">매일 오전 8시 이후 갱신돼요.</p>
        </div>
      ) : (
        <div className="bg-surface border border-line rounded-xl divide-y divide-line">
          {alerts.map((alert) => {
            const typeInfo = ALERT_TYPE_LABELS[alert.type] || { label: alert.type, color: 'bg-inset text-muted', description: '' };
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
