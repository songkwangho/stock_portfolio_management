'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { useAlertStore } from '@/stores/useAlertStore';
import { getDataFreshnessShort } from '@/lib/dataFreshness';

const ALERT_TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  sell_signal: { label: '가격 하락 경고', icon: '🔴', color: 'text-red-400 bg-red-500/10' },
  sma5_break: { label: '단기 하락 알림', icon: '📉', color: 'text-red-400 bg-red-500/10' },
  sma5_touch: { label: '가격 지지 알림', icon: '💡', color: 'text-emerald-400 bg-emerald-500/10' },
  target_near: { label: '목표가 근접 알림', icon: '🎯', color: 'text-yellow-400 bg-yellow-500/10' },
  undervalued: { label: '저평가 분석 결과', icon: '💎', color: 'text-blue-400 bg-blue-500/10' },
};

export default function AlertsPage() {
  const router = useRouter();
  const { alerts, fetchAlerts, markAllRead, deleteAlert } = useAlertStore();

  useEffect(() => {
    fetchAlerts();
    markAllRead();
  }, [fetchAlerts, markAllRead]);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold mb-4">알림</h2>
      {alerts.length === 0 ? (
        <div className="text-center py-20 bg-slate-900/20 border border-dashed border-slate-800 rounded-3xl">
          <p className="text-3xl mb-4">🔔</p>
          <p className="text-slate-300 font-bold">아직 알림이 없어요</p>
          <p className="text-slate-500 text-sm mt-2">보유·관심 종목에 주요 변화가 생기면 알려드려요</p>
        </div>
      ) : (
        alerts.map((alert) => {
          const typeInfo = ALERT_TYPE_LABELS[alert.type] || { label: alert.type, icon: '📋', color: 'text-slate-400 bg-slate-500/10' };
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
              <p className="text-xs text-slate-400 leading-relaxed pl-7">{alert.message}</p>
              <p className="text-xs text-slate-600 mt-1 pl-7">{getDataFreshnessShort(alert.created_at)}</p>
              <div className="pl-7 mt-2">
                <button onClick={() => router.push(`/stock/${alert.code}`)} className="text-xs font-bold px-4 py-2 min-h-[44px] bg-blue-600/80 hover:bg-blue-500 text-white rounded-lg transition-colors">
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
