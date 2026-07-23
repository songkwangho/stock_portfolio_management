import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// --- Separated Modules ---
import pool from './db/connection.js';
import { initSchema } from './db/schema.js';
import { runMigrations } from './db/migrate.js';
import { registerInitialData } from './domains/stock/data.js';
import { setupScheduler, setupCleanup } from './scheduler.js';

// --- Domain Routers ---
import alertRouter from './domains/alert/router.js';
import watchlistRouter from './domains/watchlist/router.js';
import portfolioRouter from './domains/portfolio/router.js';
import analysisRouter from './domains/analysis/router.js';
import stockRouter from './domains/stock/router.js';
import systemRouter from './domains/system/router.js';
// [임시] DART 파서 검증용 부트 샘플 — 검증 완료 후 이 import + 아래 호출부 + dartSample.js 제거.
import { sampleDartOnce } from './scrapers/dartSample.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Database Initialization (top-level await; ESM) ---
// 순서가 중요하다:
// 1) initSchema: 테이블/인덱스 생성 (멱등)
// 2) runMigrations: 예상 컬럼 검증 (information_schema 기반 경고만)
// 3) registerInitialData: stocks/recommended_stocks 시드 (ON CONFLICT로 멱등)
// 4) setupCleanup / setupScheduler: 주기 작업 시작
// 5) app.listen
console.log('📦 Schema init...');
await initSchema(pool);
console.log('🔄 Migrations...');
await runMigrations(pool);
console.log('🌱 Initial data...');
await registerInitialData(pool);

const app = express();
const PORT = process.env.PORT || 3001;

// CORS whitelist (dev + production origins).
//
// 허용 우선순위:
// 1) FRONTEND_URL 환경변수 (콤마 분리, 운영자가 명시 지정한 production URL — 가장 신뢰)
// 2) 하드코딩된 Vercel Preview 패턴 — 매 배포마다 hash가 바뀌므로 정규식으로 매칭
// 3) FRONTEND_URL_PATTERN 환경변수 — 레포 이름·org가 바뀐 경우의 비상 override
// 4) 로컬 dev 포트
//
// 모든 패턴은 `^...$` 앵커 + 호스트 제한으로 임의 path injection 방지.
const ALLOWED_ORIGINS = [
    'http://localhost:3000',  // Next.js dev
    ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map(s => s.trim()).filter(Boolean) : []),
];
const DEFAULT_ORIGIN_PATTERNS = [
    // Vercel Preview: <repo>-<hash>-<scope>.vercel.app 형태. project 이름은 stock-portfolio-management.
    /^https:\/\/stock-portfolio-management-[a-z0-9-]+\.vercel\.app$/,
];
let ORIGIN_PATTERN = null;
if (process.env.FRONTEND_URL_PATTERN) {
    try { ORIGIN_PATTERN = new RegExp(process.env.FRONTEND_URL_PATTERN); }
    catch (e) { console.error('Invalid FRONTEND_URL_PATTERN:', e.message); }
}
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (curl, server-to-server, mobile apps).
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
        if (DEFAULT_ORIGIN_PATTERNS.some(p => p.test(origin))) return callback(null, true);
        if (ORIGIN_PATTERN && ORIGIN_PATTERN.test(origin)) return callback(null, true);
        // CORS 거부는 에러 throw 대신 false로 반환 — 500 대신 정상 401-ish 흐름.
        console.warn(`CORS blocked origin: ${origin}`);
        return callback(null, false);
    },
    credentials: true,
}));
app.use(express.json());

// Rate limiting per device_id (or IP fallback)
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 120, // 120 requests per minute per key
    keyGenerator: (req) => req.headers['x-device-id'] || req.ip,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
    validate: false,
});
app.use('/api/', apiLimiter);
app.use('/charts', express.static(path.join(__dirname, '..', 'public', 'charts')));

// Cleanup old data + start scheduler (delayed sync on startup + daily 8AM)
console.log('🧹 Cleanup setup...');
setupCleanup(pool);
console.log('⏰ Scheduler setup...');
setupScheduler();

// --- Mount Domain Routers ---
// Path-prefix 라우터(alerts/watchlist/holdings)는 prefix가 겹치지 않아 순서 무관.
// '/api'에 직접 마운트되는 analysis/stock/system은 specific path를 먼저 둬야 한다 —
// analysisRouter의 '/stock/:code/indicators'가 stockRouter의 '/stock/:code'에 가로채이지 않도록.
app.use('/api/alerts', alertRouter);
app.use('/api/watchlist', watchlistRouter);
app.use('/api/holdings', portfolioRouter);
app.use('/api', systemRouter);   // owns /health, /market/indices (no /stock/* conflict)
app.use('/api', analysisRouter); // owns /stock/:code/{indicators,volatility,financials,news,chart}, /screener, /sector
app.use('/api', stockRouter);    // owns /stock/:code, /stocks, /search, /recommendations

app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🌐 CORS origin: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);

    // [임시] DART 파서 검증 부트 샘플 — 플래그(DART_SAMPLE_ON_BOOT=1)가 있을 때만 1회 실행.
    // 15초 지연: 기동 직후 syncAllStocks와 겹치지 않게. 실패해도 서버 기동에 영향 없음.
    // 검증 완료 후 이 블록 + import + server/scrapers/dartSample.js 를 제거하는 후속 커밋 예정.
    if (process.env.DART_API_KEY && process.env.DART_SAMPLE_ON_BOOT === '1') {
        setTimeout(() => {
            sampleDartOnce().catch(e => console.error('[dart-sample] failed:', e.message));
        }, 15000);
    }
});
