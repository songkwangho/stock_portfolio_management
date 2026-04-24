# 배포 체크리스트

## Render 환경변수 (백엔드)

| 변수 | 예시값 | 비고 |
|------|--------|------|
| DATABASE_URL | postgres://... | Neon pooler 엔드포인트 |
| FRONTEND_URL | https://your-app.vercel.app | CORS 허용 오리진. 반드시 Vercel 프로덕션 URL |
| PORT | 3001 | Render 기본값 사용 가능 |
| NODE_ENV | production | |

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
