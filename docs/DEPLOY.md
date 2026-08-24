# 배포 체크리스트

## Render 환경변수 (백엔드)

| 변수 | 예시값 | 비고 |
|------|--------|------|
| DATABASE_URL | postgres://... | Neon pooler 엔드포인트 |
| FRONTEND_URL | https://your-app.vercel.app | CORS 허용 오리진. 반드시 Vercel 프로덕션 URL |
| PORT | 3001 | Render 기본값 사용 가능 |
| NODE_ENV | production | |
| DART_API_KEY | (금감원 OpenDART 인증키) | 4.5a차 — DART 재무제표·공시. **미설정 시 DART 기능 비활성**(에러 아님, `available:false` 폴백). sync 스크립트 실행에도 필요. 코드·로그·커밋에 노출 금지 |

## Vercel 환경변수 (프론트엔드)

| 변수 | 예시값 | 비고 |
|------|--------|------|
| NEXT_PUBLIC_API_BASE_URL | https://your-render-api.onrender.com/api | 슬래시 없이 끝낼 것 |
| API_BASE_URL | https://your-render-api.onrender.com/api | Server Component 전용 |
| NEXT_PUBLIC_APP_VERSION | 1.0.0 | 미설정 시 settings에 "dev" 표시 |

## 배포 순서 (고정)

1. Neon DB 확인 (마이그레이션 완료 상태)
2. Render 배포 → API URL 확정
3. Vercel 환경변수에 `NEXT_PUBLIC_API_BASE_URL` 입력
4. Vercel 빌드 트리거
5. E2E 수동 검증

## Render cold start 대응

- Health Check 경로: `/api/health`
- HealthGate 타임아웃: 25초 (현재 설정값)
- Render 무료 플랜: 15분 비활성 후 sleep → 첫 요청 30~50초 소요
- 권장: Render Health Check 설정에서 `/api/health` 등록 시 sleep 방지 효과 있음
  (무료 플랜은 미보장이나 실효 있음)

### 크론 워밍 (⚠️ 운영자 1단계 배치 필요)

워크플로 파일은 준비돼 있고 **경로만 옮기면 된다** — `docs/warm-api.workflow.yml`:

```bash
mkdir -p .github/workflows
git mv docs/warm-api.workflow.yml .github/workflows/warm-api.yml
git commit -m "ci: /api/health 크론 워밍" && git push
```

CC 토큰 스코프가 `gist, read:org, repo`뿐이라 `.github/workflows/` 생성이 GitHub에서
거부된다(`workflow` 스코프 필요). `gh auth refresh -s workflow` 후에는 CC가 옮길 수 있다.

배치하면 GitHub Actions가 `/api/health`를 **10분 간격, 07:00~24:00 KST**로 핑한다. 별도 계정·결제
없이 동작한다(이 레포는 public이라 Actions 분 무료). 도메인이 바뀌면 레포 **Variables**에
`RENDER_API_URL`을 넣으면 되고, 기본값 폴백이 있어 설정 없이도 동작한다.
수동 실행은 Actions 탭 → `warm-api` → **Run workflow**.

**왜 24시간이 아닌가**: Render 무료는 월 **750 인스턴스-시간**이다. 24시간 워밍은 ~720시간으로
여유가 거의 없다. 17시간/일(≈510시간/월)만 깨워 두고 심야는 자연 sleep에 맡긴다.

⚠️ **워밍의 한계 — 이것만으로 콜드가 사라지지 않는다**

| 항목 | 워밍 효과 |
|---|---|
| 인스턴스 sleep (30~50초) | ✅ 해소 (핑이 제때 도착한 경우) |
| `/recommendations` | ✅ 무관 — `stocks` 스냅샷 단일 JOIN이라 캐시 불필요 |
| `/stock/:code` | ❌ **여전히 콜드** — 종목 캐시 TTL 10분, 미스 시 네이버 스크래핑 ~15초 |

- 워밍은 **인스턴스만** 깨운다. `server/helpers/cache.js`의 종목 캐시(TTL 10분)는 채우지 않는다.
  주요 종목 캐시 프리로드는 과설계 위험이 있어 보류(필요성 확인 후 별도 검토).
- GitHub `schedule`은 **최소 5분 간격 + 지연·누락이 흔하다**(수 분~수십 분). 15분 sleep 문턱을
  항상 이기지는 못한다 → 확실히 하려면 아래 외부 크론이 낫다.
- **60일간 레포 활동이 없으면 스케줄이 자동 비활성화**된다(재활성화는 수동).

**대안 — 외부 크론(더 정확, 운영자 계정 필요)**: UptimeRobot(5분 무료) 또는 cron-job.org에
`GET https://<render-api>/api/health`를 5~10분 간격으로 등록. GitHub Actions보다 시각이 정확하고
레포 활동에 의존하지 않는다. 둘을 병행해도 무해하다(핑은 멱등).

**근본 해소**: Render **Starter($7/월)** 전환 시 상시 웜 → 워밍 크론 자체가 불필요.
(운영자 결정 사항)

## 배포 후 첫 기동 시 예상 로그

```
📦 Schema init...
PostgreSQL schema initialized.
🔄 Migrations...
PostgreSQL migration checks complete.
🌱 Initial data...
🧹 Cleanup setup...
⏰ Scheduler setup...
[directory] stocks_directory 비어 있음 → KRX 동기화 시작...
[directory] KOSPI N건 / KOSDAQ M건 upsert 완료 (~50s)
Stock data sync started (batch 3)...
✅ Server running on port 3001
🌐 CORS origin: https://your-app.vercel.app
```

## Phase 5 착수 전 외부 작업 (운영자 직접 수행)

- Google Cloud Console → OAuth 앱 등록, Client ID/Secret 발급
- Kakao Developers → 앱 등록, Redirect URI 등록, 비즈앱 심사 신청 (영업일 3~7일)
  - 등록할 Redirect URI: `https://your-app.vercel.app/api/auth/callback/kakao`
  - 주의: Vercel Preview URL은 매 배포마다 변경 → Production URL만 등록
- Toss Payments → 테스트 상점 생성, 웹훅 URL 등록 준비
