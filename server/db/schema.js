// PostgreSQL 초기 DDL — SQLite의 migrate.js로 추가되던 컬럼(eps_current, eps_previous,
// source, category 등)을 모두 초기 스키마에 내재화한다.
// (chart_path 컬럼은 Puppeteer 제거와 함께 삭제됐다.)
// 신규 DB에서는 migrate.js가 사실상 불필요 (기존 SQLite 데이터 마이그레이션 검증용으로만 남김).
export async function initSchema(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS stocks (
            code         TEXT PRIMARY KEY,
            name         TEXT,
            category     TEXT,
            price        INTEGER,
            change       TEXT,
            change_rate  TEXT,
            per          NUMERIC(10,4),
            pbr          NUMERIC(10,4),
            roe          NUMERIC(10,4),
            target_price INTEGER,
            eps_current  NUMERIC(14,4),
            eps_previous NUMERIC(14,4),
            last_updated TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    // avg_price는 NUMERIC(14,2) — 분할 매수 시 평균이 소수점 1~2자리까지 발생할 수 있어 INTEGER 반올림은 손실 (16차 설계-A).
    await pool.query(`
        CREATE TABLE IF NOT EXISTS holding_stocks (
            device_id    TEXT NOT NULL DEFAULT 'default',
            code         TEXT NOT NULL REFERENCES stocks (code) ON DELETE CASCADE,
            avg_price    NUMERIC(14, 2),
            weight       INTEGER,
            quantity     INTEGER DEFAULT 0,
            last_updated TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (device_id, code)
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS stock_history (
            code   TEXT NOT NULL,
            date   TEXT NOT NULL,
            price  INTEGER,
            open   INTEGER,
            high   INTEGER,
            low    INTEGER,
            volume BIGINT,
            PRIMARY KEY (code, date)
        )
    `);

    // 3.14차 — 벤치마크(KOSPI 대비 초과수익·정보비율)용 지수 일봉.
    // stocks와 FK 없음(지수는 종목이 아님). stock_history 오염을 피하려 전용 테이블로 분리.
    // close는 NUMERIC — 지수는 소수점 값이라 INTEGER 반올림 손실을 막는다.
    // 적재는 scripts/sync-index-history.js (운영자 수동). 자동 스케줄링은 Phase 6 이월.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS market_index_history (
            symbol TEXT NOT NULL,
            date   TEXT NOT NULL,
            close  NUMERIC(12, 2),
            PRIMARY KEY (symbol, date)
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS recommended_stocks (
            code       TEXT PRIMARY KEY REFERENCES stocks (code) ON DELETE CASCADE,
            reason     TEXT,
            fair_price INTEGER,
            score      INTEGER,
            source     TEXT DEFAULT 'manual',
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    // ai_report / ai_report_date: Phase 5 Claude Haiku AI 리포트 선행 컬럼 (현재는 NULL 유지).
    await pool.query(`
        CREATE TABLE IF NOT EXISTS stock_analysis (
            code           TEXT PRIMARY KEY REFERENCES stocks (code) ON DELETE CASCADE,
            analysis       TEXT,
            advice         TEXT,
            opinion        TEXT,
            toss_url       TEXT,
            ai_report      TEXT,
            ai_report_date DATE,
            created_at     TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    // source: 'holding' | 'watchlist' — 프론트에서 알림 출처를 구분 표시하는 용도 (14차 5-1).
    await pool.query(`
        CREATE TABLE IF NOT EXISTS alerts (
            id         BIGSERIAL PRIMARY KEY,
            device_id  TEXT NOT NULL DEFAULT 'default',
            code       TEXT NOT NULL,
            name       TEXT,
            type       TEXT NOT NULL,
            source     TEXT NOT NULL DEFAULT 'holding',
            message    TEXT NOT NULL,
            read       INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS watchlist (
            device_id TEXT NOT NULL DEFAULT 'default',
            code      TEXT NOT NULL REFERENCES stocks (code) ON DELETE CASCADE,
            added_at  TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (device_id, code)
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS investor_history (
            code         TEXT NOT NULL,
            date         TEXT NOT NULL,
            institution  BIGINT,
            foreign_net  BIGINT,
            individual   BIGINT,
            PRIMARY KEY (code, date)
        )
    `);

    // 3.6차 — 전 상장 종목 명↔코드 매핑. stocks 테이블과 FK 없음.
    // (디렉토리는 전 종목, stocks는 앱 등록 종목만. KRX CSV로 일 1회 동기화.)
    await pool.query(`
        CREATE TABLE IF NOT EXISTS stocks_directory (
            code        TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            market      TEXT NOT NULL CHECK (market IN ('KOSPI', 'KOSDAQ', 'KONEX')),
            listed_at   DATE,
            delisted_at DATE,
            updated_at  TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    // 3.7차 — 다대다 테마 매핑. 초기 10개 테마 + 종목 큐레이션 (data.js).
    // theme_id는 시스템 식별자(영문 소문자/언더스코어), theme_name은 UI 표시용.
    // 동일 테마에 대해 theme_name을 여러 행에 중복 저장하지만 10개 × 평균 10종목
    // 스케일이라 정규화 비용 대비 단순성 이득이 큼.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS stock_themes (
            theme_id    TEXT NOT NULL,
            theme_name  TEXT NOT NULL,
            code        TEXT NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
            PRIMARY KEY (theme_id, code)
        )
    `);

    // Phase 5 선행 — 소셜 로그인 + 구독 DDL. 아직 라우트 미연결, 데이터 미사용.
    // schema.js에 선행 배치해야 Phase 5 착수 시 ALTER TABLE 없이 바로 기능 구현 가능.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id               BIGSERIAL PRIMARY KEY,
            provider         TEXT NOT NULL,
            provider_id      TEXT NOT NULL,
            email            TEXT,
            nickname         TEXT,
            legacy_device_id TEXT,
            created_at       TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(provider, provider_id)
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_subscriptions (
            id         BIGSERIAL PRIMARY KEY,
            user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            status     TEXT NOT NULL DEFAULT 'inactive',
            plan       TEXT NOT NULL DEFAULT 'monthly',
            expires_at TIMESTAMPTZ,
            payment_id TEXT UNIQUE,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    // 4.5a차 — DART OpenAPI 연동. 종목상세 [기업] 탭용 재무제표 원문 + 공시.
    // corp_code(DART 8자리)는 stock_code(6자리)와 별개라 매핑 테이블 선행 필요.
    // 세 테이블 모두 stocks와 FK 없음 — DART는 전 상장사 대상이고, 적재 실패가
    // stocks cascade에 영향을 주면 안 되기 때문(재무/공시는 부가 정보).
    await pool.query(`
        CREATE TABLE IF NOT EXISTS dart_corp_codes (
            corp_code   TEXT PRIMARY KEY,
            stock_code  TEXT,
            corp_name   TEXT NOT NULL,
            modify_date TEXT,
            updated_at  TIMESTAMPTZ DEFAULT NOW()
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_dart_corp_stock ON dart_corp_codes(stock_code)');

    // fs_div: 'CFS'(연결) | 'OFS'(별도). quarter: '1Q'~'4Q'. amount는 NUMERIC(20,0)
    // (재무제표 금액은 원 단위 정수, 수조 원까지 커버).
    await pool.query(`
        CREATE TABLE IF NOT EXISTS dart_financials (
            code        TEXT NOT NULL,
            year        INTEGER NOT NULL,
            quarter     TEXT NOT NULL,
            fs_div      TEXT NOT NULL,
            account_id  TEXT NOT NULL,
            account_nm  TEXT,
            amount      NUMERIC(20,0),
            prev_amount NUMERIC(20,0),
            updated_at  TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (code, year, quarter, fs_div, account_id)
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_dart_fin_code ON dart_financials(code, year DESC)');

    // category: 규칙 기반 분류(표시용, 신호 아님). 원문 링크는 rcept_no로 구성.
    // rm: 비고(정=정정공시, 철=철회, 연=연결 등) — 정정/철회 공시 UI 안전장치.
    // corp_cls: 시장구분(Y=유가/K=코스닥/N=코넥스/E=기타) — 저장만, UI 미사용.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS dart_disclosures (
            rcept_no   TEXT PRIMARY KEY,
            code       TEXT NOT NULL,
            corp_name  TEXT,
            report_nm  TEXT NOT NULL,
            rcept_dt   TEXT NOT NULL,
            flr_nm     TEXT,
            category   TEXT,
            rm         TEXT,
            corp_cls   TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_dart_disc_code_dt ON dart_disclosures(code, rcept_dt DESC)');

    // 4.5b차 — 거래일지(행동편향 진단)용 정규화 거래. 원본 CSV·PII(계좌번호·예수금·성명)는 저장 안 함.
    // 파싱 즉시 폐기하고 아래 화이트리스트 컬럼만 적재. device_id 익명 모델. DELETE /api/journal로 전량 삭제.
    // price는 NUMERIC → pg가 string 반환 → 읽을 때 Number() 캐스팅 필수.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS journal_trades (
            id         BIGSERIAL PRIMARY KEY,
            device_id  TEXT NOT NULL,
            code       TEXT NOT NULL,
            side       TEXT NOT NULL CHECK (side IN ('buy','sell')),
            quantity   INTEGER NOT NULL,
            price      NUMERIC(14,2) NOT NULL,
            traded_at  DATE NOT NULL,
            source     TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_journal_trades_device ON journal_trades(device_id, code, traded_at)');

    // C-1차 — 거래일지 적재 메타(디바이스당 1행). 커버리지 고지를 업로드 직후 1회성이 아니라
    // analysis에서 지속 노출하기 위함. skipped(제외 "거래 건수")와 skipped_names(제외 "distinct 종목명")를
    // 분리 저장 → "30건(종목 X개)"로 구분 고지. F1 교체와 동일하게 업로드마다 upsert(1행).
    await pool.query(`
        CREATE TABLE IF NOT EXISTS journal_imports (
            device_id     TEXT PRIMARY KEY,
            total         INTEGER,
            imported      INTEGER,
            skipped       INTEGER,
            skipped_names TEXT[],
            uploaded_at   TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    // Indices
    await pool.query('CREATE INDEX IF NOT EXISTS idx_investor_history_code_date ON investor_history(code, date)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_stock_history_code_date ON stock_history(code, date)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_stocks_category ON stocks(category)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_alerts_device_read ON alerts(device_id, read, created_at)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_stocks_directory_name ON stocks_directory(name)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_stocks_directory_market ON stocks_directory(market)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_stock_themes_code ON stock_themes(code)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_stock_themes_theme_id ON stock_themes(theme_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_users_legacy_device_id ON users(legacy_device_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id)');

    console.log('PostgreSQL schema initialized.');
}
