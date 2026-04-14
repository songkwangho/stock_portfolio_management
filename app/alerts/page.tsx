'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { useAlertStore } from '@/stores/useAlertStore';
import { getDataFreshnessShort } from '@/lib/dataFreshness';

const ALERT_TYPE_LABELS: Record<string, { label: string; icon: string; color: string; description: string }> = {
  sell_signal: {
    label: '가격 하락 경고', icon: '🔴', color: 'text-red-400 bg-red-500/10',
    description: '평단가 대비 -7% 이상 하락해 손절 기준에 닿았어요. 분석을 다시 확인해 보세요.',
  },
  sma5_break: {
    label: '단기 하락 알림', icon: '📉', color: 'text-red-400 bg-red-500/10',
    description: '5일 평균선 아래로 떨어졌어요. 단기 하락 흐름일 수 있으니 추세를 지켜보세요.',
  },
  sma5_touch: {
    label: '가격 지지 알림', icon: '💡', color: 'text-emerald-400 bg-emerald-500/10',
    description: '5일 평균선 근처에서 지지받고 있어요. 반등 가능 구간일 수 있어요.',
  },
  target_near: {
    label: '목표가 근접 알림', icon: '🎯', color: 'text-yellow-400 bg-yellow-500/10',
    description: '애널리스트 목표가에 가까워졌어요. 차익 실현 시점을 고민해 볼 때예요.',
  },
  undervalued: {
    label: '저평가 분석 결과', icon: '💎', color: 'text-blue-400 bg-blue-500/10',
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
  }, [fetchAlerts, markAllRead]);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold mb-4">알림</h2>
      {showGuide && (
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-5">
          <p className="text-sm font-bold text-blue-300 mb-2">📬 알림은 어떻게 동작하나요?</p>
          <ul className="text-xs text-slate-400 space-y-1.5 leading-relaxed">
            <li>• 보유·관심 종목에 주요 변화가 생기면 알려드려요</li>
            <li>• 하루 1회 갱신이에요 (실시간이 아니에요)</li>
            <li>• 동일 종목당 하루 최대 2건만 전송해요</li>
            <li>• 이평선 관련 알림은 보유 종목에만 발생해요</li>
          </ul>
          <button onClick={() => setShowGuide(false)} className="mt-3 text-xs text-blue-400 font-bold">알겠어요</button>
        </div>
      )}
      {alerts.length === 0 ? (
        <div className="text-center py-20 bg-slate-900/20 border border-dashed border-slate-800 rounded-3xl">
          <p className="text-3xl mb-4">🔔</p>
          <p className="text-slate-300 font-bold">아직 알림이 없어요</p>
          <p className="text-slate-500 text-sm mt-2">보유·관심 종목에 주요 변화가 생기면 알려드려요</p>
        </div>
      ) : (
        alerts.map((alert) => {
          const typeInfo = ALERT_TYPE_LABELS[alert.type] || { label: alert.type, icon: '📋', color: 'text-slate-400 bg-slate-500/10', description: '' };
          return (
            <div key={alert.id} className="px-5 py-3 bg-slate-900/50 border border-slate-800 rounded-2xl">
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center space-x-2 flex-wrap">
                  <span className="text-sm">{typeInfo.icon}</span>
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${typeInfo.color}`}>{typeInfo.label}</span>
                  <span className="text-xs text-slate-500 font-bold">{alert.name}</span>
                </div>
                <button onClick={() => deleteAlert(alert.id)} className="text-red-400/60 active:text-red-400 p-1" aria-label="알림 삭제">
                  <Trash2 size={14} />
                </button>
              </div>
              {typeInfo.description && (
                <p className="text-xs text-slate-300 leading-relaxed pl-7 mb-1">{typeInfo.description}</p>
              )}
              <p className="text-xs text-slate-500 leading-relaxed pl-7">{alert.message}</p>
              <p className="text-xs text-slate-600 mt-1 pl-7">{getDataFreshnessShort(alert.created_at)}</p>
              <div className="pl-7 mt-2">
                <button onClick={() => router.push(`/stock/${alert.code}?from=alerts`)} className="text-xs font-bold px-4 py-2 min-h-[44px] bg-blue-600/80 hover:bg-blue-500 text-white rounded-lg transition-colors">
                  지금 확인하기
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
