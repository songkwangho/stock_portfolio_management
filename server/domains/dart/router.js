// 4.5a차 — DART 재무제표·공시 조회 (종목상세 [기업] 탭). DB 읽기 전용(적재는 sync 스크립트).
// 데이터 없으면 available:false로 폴백 — 500 금지. 캐시 10분(cache.js 패턴).
import express from 'express';
import { query } from '../../db/connection.js';
import { getCached, setCache } from '../../helpers/cache.js';
import { TARGET_ACCOUNTS, SECTIONS } from '../../helpers/dartAccounts.js';
import { categoryLabel } from '../../helpers/dartCategory.js';
import { deriveFinancialTrends } from './derive.js';

const router = express.Router();

// GET /api/stock/:code/dart/financials
// → { available, fsDiv, periods:['2025 3Q',...], statements:{ income:[{label,values}], balance:[], cashflow:[] } }
router.get('/stock/:code/dart/financials', async (req, res) => {
    const { code } = req.params;
    const cacheKey = `dart_fin_${code}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);
    try {
        const { rows } = await query(
            `SELECT year, quarter, fs_div, account_id, amount
             FROM dart_financials WHERE code = $1
             ORDER BY year DESC, quarter DESC`,
            [code]
        );
        if (rows.length === 0) { const out = { available: false }; setCache(cacheKey, out); return res.json(out); }

        // fs_div 선택: **최신 기간 기준** 연결(CFS) 우선, 없으면 별도(OFS).
        // 전역(아무 CFS나 있으면 CFS)으로 고르면 최신이 OFS-only인 종목의 최신 데이터가 누락된다.
        // rows는 year DESC, quarter DESC 정렬 → rows[0]이 최신 기간.
        const latestRows = rows.filter(r => r.year === rows[0].year && r.quarter === rows[0].quarter);
        const fsDiv = latestRows.some(r => r.fs_div === 'CFS') ? 'CFS' : 'OFS';
        const frows = rows.filter(r => r.fs_div === fsDiv);

        // 최근 4개 기간 (year, quarter) — 이미 desc 정렬. 중복 제거.
        const seen = new Set();
        const periods = [];
        for (const r of frows) {
            const key = `${r.year}|${r.quarter}`;
            if (!seen.has(key)) { seen.add(key); periods.push({ year: r.year, quarter: r.quarter }); }
            if (periods.length >= 4) break;
        }

        // (year|quarter|account_id) → amount(Number). KRW 정수는 9e15 미만이라 Number 안전.
        const amtMap = {};
        for (const r of frows) amtMap[`${r.year}|${r.quarter}|${r.account_id}`] = r.amount != null ? Number(r.amount) : null;

        const statements = {};
        for (const section of SECTIONS) {
            statements[section] = TARGET_ACCOUNTS
                .filter(a => a.section === section)
                .map(a => ({
                    label: a.label,
                    values: periods.map(p => amtMap[`${p.year}|${p.quarter}|${a.id}`] ?? null),
                }));
        }

        const out = {
            available: true,
            fsDiv,
            periods: periods.map(p => `${p.year} ${p.quarter}`),
            statements,
            // Phase A — 성장·현금흐름 질 관점 입력. 위 rows(전 기간)를 그대로 재사용하므로 추가 쿼리 없음.
            // periods는 표시용 4기간으로 잘려 전년 동기가 빠지지만, rows에는 남아 있어 YoY가 가능하다.
            derived: deriveFinancialTrends(rows),
        };
        setCache(cacheKey, out);
        res.json(out);
    } catch (e) {
        console.error('DART financials error:', e.message);
        res.json({ available: false });
    }
});

// GET /api/stock/:code/dart/disclosures?months=3
// → { available, items:[{ rceptNo, reportNm, rceptDt, category, categoryLabel, rm, isRevised, isWithdrawn, url }] }
// 공시 없음은 정상 → available:true, items:[] (UI "최근 공시가 없어요"). 에러만 available:false.
router.get('/stock/:code/dart/disclosures', async (req, res) => {
    const { code } = req.params;
    const months = Math.min(12, Math.max(1, parseInt(req.query.months, 10) || 3));
    const cacheKey = `dart_disc_${code}_${months}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);
    try {
        // N개월 전 — setMonth 월말 오버플로(예: 3/31 → "2/31" → 3/3) 방지 위해 일자 클램프.
        const now = new Date();
        const day = now.getDate();
        const bgn = new Date(now.getFullYear(), now.getMonth(), 1);
        bgn.setMonth(bgn.getMonth() - months);
        const dim = new Date(bgn.getFullYear(), bgn.getMonth() + 1, 0).getDate();
        bgn.setDate(Math.min(day, dim));
        const bgnDt = `${bgn.getFullYear()}${String(bgn.getMonth() + 1).padStart(2, '0')}${String(bgn.getDate()).padStart(2, '0')}`;
        const { rows } = await query(
            `SELECT rcept_no, report_nm, rcept_dt, flr_nm, category, rm
             FROM dart_disclosures WHERE code = $1 AND rcept_dt >= $2
             ORDER BY rcept_dt DESC LIMIT 30`,
            [code, bgnDt]
        );
        const items = rows.map(r => {
            const rm = r.rm || '';
            const cat = r.category || 'other';
            return {
                rceptNo: r.rcept_no,
                reportNm: r.report_nm,
                rceptDt: r.rcept_dt,
                category: cat,
                categoryLabel: categoryLabel(cat),
                rm: rm || null,
                isRevised: rm.includes('정'),    // 정정공시
                isWithdrawn: rm.includes('철'),   // 철회
                url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${r.rcept_no}`,
            };
        });
        const out = { available: true, items };
        setCache(cacheKey, out);
        res.json(out);
    } catch (e) {
        console.error('DART disclosures error:', e.message);
        res.json({ available: false, items: [] });
    }
});

export default router;
