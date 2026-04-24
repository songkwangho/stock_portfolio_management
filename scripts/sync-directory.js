#!/usr/bin/env node
// KRX 상장법인목록 → stocks_directory 수동 동기화 스크립트.
// 실행: DATABASE_URL=postgres://... node scripts/sync-directory.js
//
// 일 1회 스케줄링은 Phase 6 본작업에서 setupScheduler에 편입 예정.
// 현 시점에선 운영자가 필요 시 수동으로 돌리거나, 서버 재시작 시 (디렉토리 비어있을 때만) 자동 동기화.
import 'dotenv/config';
import { syncDirectory } from '../server/domains/stock/directory.js';
import pool from '../server/db/connection.js';

(async () => {
    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL 환경변수가 필요합니다.');
        process.exit(1);
    }
    try {
        await syncDirectory();
    } catch (e) {
        console.error('sync-directory failed:', e);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
})();
