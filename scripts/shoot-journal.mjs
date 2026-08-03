// CC 시각검증 하네스 — /journal을 결정적으로 렌더·캡처(수동 스샷 루프 제거).
// vitest 유닛과 별개(브라우저+네트워크 필요) → CI 기본 파이프라인에 넣지 말 것.
//
// 결정적 렌더: 킬러 한 줄은 "실현 이익 ≥1 && 미실현 손실 ≥1"에서만 뜬다. 라이브 종가에 무관하게
// 손실이 되도록 007070을 비현실적 고가(9,999,999)로 매수(매도 없음)→어떤 실제 종가와 대비해도 손실.
// 005930은 저가 매수→고가 매도로 실현 이익 1건(win). 둘 다 유니버스(188) 안 → 매핑 성공.
//
// 격리·정리: 전용 throwaway device_id로 API-seed(UI 파일업로드 우회 → EUC-KR 함정 없음) 후
// finally에서 삭제 → prod Neon 오염 없음.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.SHOT_BASE_URL || 'https://stock-portfolio-management-kohl.vercel.app';
const API = process.env.SHOT_API_BASE || 'https://stock-portfolio-management.onrender.com/api';
const DEV = 'pw-e2e-journal';   // 실계좌와 격리된 일회용 device_id
const OUT = 'artifacts';

// 키움 실헤더 22컬럼 형식(프리앰블 1행) + 매수/매도 3행.
const FIXTURE_CSV = [
  '[키움증권]주식 거래내역,,,,,,,,,,,,,,,,,,,,,',
  '거래일자,종목명,거래수량,거래금액,거래세/농특세,정산금액,미수변제,예수금,대출상환금,대출일,매체구분,거래소,거래구분,거래단가,수수료,소득세/주민세,미수발생금,연체변제,유가잔고,신용/대출이자,상환차금,처리시간',
  // 005930 삼성전자 — 저가 매수→고가 매도 = 실현 이익 1건(win)
  '2025.08.01,삼성전자,10,1000000,0,1000000,,0,0,,영웅문S#,KRX,장내매수,100000,0,0,,0,0,0,0,10:00:00',
  '2025.08.20,삼성전자,10,2000000,0,2000000,,0,0,,영웅문S#,KRX,장내매도,200000,0,0,,0,0,0,0,10:00:00',
  // 007070 GS리테일 — 비현실 고가 매수(매도 없음) = 어떤 실제 종가와도 미실현 손실 보장
  '2025.08.05,GS리테일,10,99999990,0,99999990,,0,0,,영웅문S#,KRX,장내매수,9999999,0,0,,0,0,0,0,10:00:00',
].join('\n');

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 1400 } });
  try {
    // 1) 시드 — API-seed(파일업로드 우회). Render cold start 대비 넉넉한 타임아웃.
    const up = await ctx.request.post(`${API}/journal/upload`, {
      headers: { 'X-Device-Id': DEV }, data: { csvText: FIXTURE_CSV, broker: 'kiwoom' }, timeout: 90000,
    });
    const upJson = await up.json().catch(() => ({}));
    console.log('[seed]', up.status(), JSON.stringify(upJson));
    if (!up.ok() || !(upJson.imported >= 1)) throw new Error(`seed failed: ${up.status()}`);

    // 2) device_id 주입(앱 부팅 전) 후 /journal 로드
    const page = await ctx.newPage();
    // device_id 주입 + 온보딩/면책 모달 억제(시각검증 노이즈 제거 — /journal 본문만 캡처).
    await page.addInitScript((id) => {
      try {
        localStorage.setItem('device_id', id);
        localStorage.setItem('disclaimer_accepted', '1');
        localStorage.setItem('onboarding_done', '1');
      } catch { /* noop */ }
    }, DEV);
    await page.goto(`${BASE}/journal`, { waitUntil: 'networkidle', timeout: 90000 });

    // 3) 킬러 카드 대기 (HealthGate + cold start + analysis fetch → 넉넉히). 없으면 전체만 캡처.
    let headlineFound = true;
    try {
      await page.waitForSelector('[data-testid="journal-headline"]', { timeout: 60000 });
    } catch {
      headlineFound = false;
      console.warn('[warn] journal-headline 미발견 — 배포 반영 전이거나 데이터 미노출일 수 있음');
    }

    // 4) 캡처 — 전체 + 킬러 카드 크롭
    await page.screenshot({ path: `${OUT}/journal-full.png`, fullPage: true });
    console.log('[shot]', `${OUT}/journal-full.png`);
    if (headlineFound) {
      const el = page.locator('[data-testid="journal-headline"]');
      await el.screenshot({ path: `${OUT}/journal-headline.png` });
      console.log('[shot]', `${OUT}/journal-headline.png`);
      console.log('[headline]', (await el.innerText()).replace(/\s+/g, ' ').trim());
    }
  } finally {
    // 5) 정리 — 전용 device 업로드분 삭제
    try {
      const del = await ctx.request.delete(`${API}/journal`, { headers: { 'X-Device-Id': DEV }, timeout: 60000 });
      console.log('[cleanup]', del.ok() ? 'deleted' : `delete ${del.status()}`);
    } catch (e) {
      console.warn('[cleanup] failed —', e.message, '(수동 정리: DELETE', `${API}/journal`, 'X-Device-Id:', DEV + ')');
    }
    await browser.close();
  }
}

main().catch((e) => { console.error('[error]', e.message); process.exit(1); });
