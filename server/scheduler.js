// Scheduler: syncAllStocks delayed startup + daily 8AM + cleanup
import { syncAllStocks, scheduleDaily8AM } from './domains/stock/service.js';
import { syncDirectoryIfEmpty } from './domains/stock/directory.js';

// Neon 무료 플랜 sleep 해제(1~3초)와 connectionTimeoutMillis(5초)가 겹치면 첫 sync가 조용히 실패할 수 있다.
// 다음 동기화는 다음 날 08:00이라 하루치 데이터를 잃게 됨 → 5초 후 1차 시도, 실패 시 30초 후 1회 backoff (16차 버그-D).
async function initialSyncWithRetry() {
    try {
        await syncAllStocks();
    } catch (e1) {
        console.error('Initial sync failed, retrying in 30s:', e1.message);
        setTimeout(async () => {
            try {
                await syncAllStocks();
            } catch (e2) {
                console.error('Initial sync retry also failed:', e2.message);
                // 더 이상 재시도하지 않음 — 다음 08:00 스케줄에 의존
            }
        }, 30000);
    }
}

export function setupScheduler() {
    // Delay initial sync by 5 seconds to avoid blocking server startup
    setTimeout(() => initialSyncWithRetry(), 5000);

    // Schedule daily 8AM sync
    scheduleDaily8AM();

    // 3.6차 — stocks_directory 비어 있으면 초기 1회 동기화. 실패해도 서버 시작 차단하지 않음.
    // 일 1회 스케줄링은 Phase 6 본작업에서 추가 예정.
    setTimeout(() => {
        syncDirectoryIfEmpty().catch(e => console.error('[directory] initial sync error:', e.message));
    }, 10000);
}

// Cleanup function for data older than 20 days.
// PostgreSQL 전환: pool을 명시적으로 주입받는다 (server.js → setupCleanup(pool)).
export function setupCleanup(pool) {
    async function cleanupOldData() {
        console.log('Running cleanup for data older than 20 days...');
        try {
            const thresholdDate = new Date();
            thresholdDate.setDate(thresholdDate.getDate() - 20);
            const thresholdStr = thresholdDate.toISOString();

            const delAnalysis = await pool.query(
                'DELETE FROM stock_analysis WHERE created_at < $1',
                [thresholdStr]
            );
            // source='manual' (initialRecommendations 시드)은 영구 보존.
            // ON CONFLICT가 created_at을 갱신하지 않아 시드 데이터의 created_at은 최초 부팅 시점에 고정되며,
            // 서버가 20일 이상 무중단 운영 시 시드 추천 종목이 통째로 삭제되는 버그를 방지한다.
            const delRecs = await pool.query(
                "DELETE FROM recommended_stocks WHERE created_at < $1 AND source != 'manual'",
                [thresholdStr]
            );

            // 3.13 BUG-2: alerts는 그동안 cleanup 대상이 아니어서 무한 누적됐다(보유 2종목인데 110개).
            // 30일 지난 알림은 읽음 여부와 무관하게 삭제한다 — 한 달 전의 "5일 평균 이탈" 같은
            // 가격 알림은 더 이상 유효한 정보가 아니라 노이즈다 (일 캡 2건/종목은 정상 동작 중).
            const alertThreshold = new Date();
            alertThreshold.setDate(alertThreshold.getDate() - 30);
            const delAlerts = await pool.query(
                'DELETE FROM alerts WHERE created_at < $1',
                [alertThreshold.toISOString()]
            );
            console.log(`Cleanup complete: Deleted ${delAnalysis.rowCount} analysis rows, ${delRecs.rowCount} recommendation rows, ${delAlerts.rowCount} alert rows.`);
        } catch (error) {
            console.error('Cleanup Error:', error.message);
        }
    }

    cleanupOldData();
    setInterval(cleanupOldData, 24 * 60 * 60 * 1000);
}
