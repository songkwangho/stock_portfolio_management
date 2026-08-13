'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { RefreshCw, Search } from 'lucide-react';
import { stockApi } from '@/lib/stockApi';
import type { StockSummary, ScreenerResult } from '@/types/stock';
// 프리셋 정의·보조 지표 문구는 lib/screener/presets.ts가 정본 —
// "종목 탐색"의 인라인 렌즈 버킷과 **같은 필터·같은 캐비엇**을 봐야 한다.
import { PRESETS, presetMetric, type Preset } from '@/lib/screener/presets';

const CATEGORIES = [
  '기술/IT', '바이오/헬스케어', '자동차/모빌리티', '에너지/소재',
  '금융/지주', '소비재/서비스', '엔터테인먼트/미디어', '조선/기계/방산',
];

// D3 — useSearchParams는 Suspense 경계가 필요하다(Next 15+ 빌드 차단 회피 — 3차 [P2]와 동일 패턴).
export default function ScreenerPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64 text-muted">
        <RefreshCw className="animate-spin mr-2" size={20} />
        <span>스크리너를 불러오는 중...</span>
      </div>
    }>
      <ScreenerContent />
    </Suspense>
  );
}

function ScreenerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [filters, setFilters] = useState({
    perMin: '', perMax: '', pbrMin: '', pbrMax: '',
    roeMin: '', priceMin: '', priceMax: '', category: '',
  });

  const onDetailClick = (stock: StockSummary) => {
    router.push(`/stock/${stock.code}?from=search`);
  };

  const handleSearch = async (filterOverride?: Record<string, string | number>) => {
    setLoading(true);
    setSearched(true);
    try {
      const params = filterOverride || Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== '')
      );
      const data = await stockApi.screener(params);
      setResults(data);
    } catch (error) {
      console.error('Screener failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePreset = (preset: Preset) => {
    setActivePreset(preset.name);
    setFilters({ perMin: '', perMax: '', pbrMin: '', pbrMax: '', roeMin: '', priceMin: '', priceMax: '', category: '' });
    handleSearch(preset.filters);
  };

  // D3 — "종목 탐색"의 렌즈 칩(/screener?preset=<slug>) 수신. 링크만 걸면 죽은 링크가 되므로
  // 여기서 slug를 프리셋으로 해석해 1회 자동 실행한다. ref 가드 — 재실행되면 사용자가 바꾼
  // 프리셋을 URL 값으로 되돌려버린다(useEffect가 매 렌더 재평가되는 상황 방지).
  const presetSlug = searchParams.get('preset');
  const appliedSlugRef = useRef<string | null>(null);
  useEffect(() => {
    if (!presetSlug || appliedSlugRef.current === presetSlug) return;
    const target = PRESETS.find(p => p.slug === presetSlug);
    if (!target) return;         // 알 수 없는 slug는 무시 — 빈 화면 대신 기본 상태 유지
    appliedSlugRef.current = presetSlug;
    handlePreset(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetSlug]);

  // 활성 프리셋에 따라 종목별로 표시할 보조 지표 문구 생성.
  // 정적 프리셋(저평가/자산/성장/소액)은 null 반환 → 기존 표시 유지.
  // 보조 지표 문구는 공용 presetMetric에 위임 — 스크리너와 렌즈 버킷이 같은 문구를 쓴다.
  const activePresetKey = PRESETS.find(p => p.name === activePreset)?.filters?.preset;
  const renderPresetMetric = (stock: ScreenerResult): string | null =>
    presetMetric(activePresetKey as string | undefined, stock);

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold mb-2 text-ink">종목 스크리너</h2>
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted text-sm">원하는 조건에 맞는 종목을 쉽게 찾아보세요. 아래 추천 필터를 눌러보세요!</p>
          <button
            onClick={() => router.push('/themes')}
            className="shrink-0 text-xs text-ink hover:underline font-bold px-3 py-2 min-h-[44px] flex items-center whitespace-nowrap"
          >
            테마로 보기 →
          </button>
        </div>
      </div>

      <div className="bg-inset border border-line rounded-xl p-4 text-xs text-muted leading-relaxed">
        PER = 주가 ÷ 주당이익 (낮으면 저평가), PBR = 주가 ÷ 주당자산 (1 이하면 자산 대비 저평가), ROE = 자기자본이익률 (높으면 돈을 잘 벌어요)
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {PRESETS.map(preset => (
          <button
            key={preset.name}
            onClick={() => handlePreset(preset)}
            className={`relative p-5 rounded-xl border text-left transition-colors ${
              activePreset === preset.name
                ? 'bg-ink text-surface border-ink'
                : 'bg-surface border-line hover:border-ink text-ink'
            }`}
          >
            {preset.isNew && (
              <span className={`absolute top-2 right-2 text-xs px-1.5 py-0.5 rounded-full font-bold border ${
                activePreset === preset.name ? 'bg-surface/10 text-surface border-surface/20' : 'bg-inset text-muted border-line'
              }`}>NEW</span>
            )}
            <h4 className="text-sm font-bold mb-1">{preset.name}</h4>
            <p className={`text-xs font-mono mb-1 ${activePreset === preset.name ? 'text-surface/80' : 'text-muted'}`}>{preset.summary}</p>
            <p className={`text-xs leading-relaxed ${activePreset === preset.name ? 'text-surface/70' : 'text-muted'}`}>→ {preset.description}</p>
          </button>
        ))}
      </div>

      <div className="bg-surface border border-line rounded-xl p-6">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm font-bold text-ink hover:opacity-70 transition-opacity px-4 py-3 min-h-[44px]"
        >
          <span>직접 조건 설정하기</span>
          <span className="text-sm text-faint ml-2">{showAdvanced ? '접기 ▲' : '펼치기 ▼'}</span>
        </button>

        {showAdvanced && (
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-muted block mb-1 font-bold">PER 최소</label>
                <input type="number" placeholder="예: 5" value={filters.perMin}
                  onChange={(e) => setFilters({ ...filters, perMin: e.target.value })}
                  className="w-full bg-surface border border-line-strong rounded-xl px-4 py-3 text-sm text-ink tabular-nums focus:outline-none focus:border-ink placeholder:text-faint" />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1 font-bold">PER 최대</label>
                <input type="number" placeholder="예: 20" value={filters.perMax}
                  onChange={(e) => setFilters({ ...filters, perMax: e.target.value })}
                  className="w-full bg-surface border border-line-strong rounded-xl px-4 py-3 text-sm text-ink tabular-nums focus:outline-none focus:border-ink placeholder:text-faint" />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1 font-bold">PBR 최대</label>
                <input type="number" placeholder="예: 1.5" value={filters.pbrMax} step="0.1"
                  onChange={(e) => setFilters({ ...filters, pbrMax: e.target.value })}
                  className="w-full bg-surface border border-line-strong rounded-xl px-4 py-3 text-sm text-ink tabular-nums focus:outline-none focus:border-ink placeholder:text-faint" />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1 font-bold">ROE 최소 (%)</label>
                <input type="number" placeholder="예: 10" value={filters.roeMin}
                  onChange={(e) => setFilters({ ...filters, roeMin: e.target.value })}
                  className="w-full bg-surface border border-line-strong rounded-xl px-4 py-3 text-sm text-ink tabular-nums focus:outline-none focus:border-ink placeholder:text-faint" />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-muted block mb-1 font-bold">최소 가격 (₩)</label>
                <input type="number" placeholder="예: 10000" value={filters.priceMin}
                  onChange={(e) => setFilters({ ...filters, priceMin: e.target.value })}
                  className="w-full bg-surface border border-line-strong rounded-xl px-4 py-3 text-sm text-ink tabular-nums focus:outline-none focus:border-ink placeholder:text-faint" />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1 font-bold">최대 가격 (₩)</label>
                <input type="number" placeholder="예: 500000" value={filters.priceMax}
                  onChange={(e) => setFilters({ ...filters, priceMax: e.target.value })}
                  className="w-full bg-surface border border-line-strong rounded-xl px-4 py-3 text-sm text-ink tabular-nums focus:outline-none focus:border-ink placeholder:text-faint" />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1 font-bold">업종</label>
                <select value={filters.category}
                  onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                  className="w-full bg-surface border border-line-strong rounded-xl px-4 py-3 text-sm text-ink focus:outline-none focus:border-ink">
                  <option value="">전체 업종</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <button
              onClick={() => { setActivePreset(null); handleSearch(); }}
              disabled={loading}
              className="bg-ink hover:opacity-90 text-surface font-bold py-3 px-8 rounded-xl text-sm transition-opacity flex items-center gap-2 min-h-[44px] disabled:opacity-50"
            >
              {loading ? <RefreshCw className="animate-spin" size={16} /> : <Search size={16} />}
              <span>검색하기</span>
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center h-32 text-muted">
          <RefreshCw className="animate-spin mr-2" size={20} />
          <span>조건에 맞는 종목을 찾고 있어요...</span>
        </div>
      )}

      {!loading && searched && results.length === 0 && (() => {
        // 수급 프리셋은 investor_history가 비어 있으면 항상 0건 — 별도 안내.
        const preset = PRESETS.find(p => p.name === activePreset);
        const isSupplyDemand = preset?.filters?.preset === 'foreign_buy' || preset?.filters?.preset === 'fund_buy';
        if (isSupplyDemand) {
          return (
            <div className="text-center py-12 bg-inset border border-dashed border-line-strong rounded-xl">
              <p className="text-sm text-ink font-bold">수급 데이터를 수집 중이에요</p>
              <p className="text-xs text-muted mt-1">매일 08:00 업데이트 후 표시돼요.</p>
            </div>
          );
        }
        return (
          <div className="text-center py-16 bg-inset border border-dashed border-line-strong rounded-xl">
            <p className="text-muted">조건에 맞는 종목이 없어요. 조건을 조금 넓혀보세요.</p>
          </div>
        );
      })()}

      {!loading && results.length > 0 && (
        <div className="space-y-4">
          <div className="bg-caution/5 border border-caution/20 rounded-xl p-4 text-xs text-caution leading-relaxed">
            <p className="font-bold mb-1">아래 종목들은 조건에 맞는 참고 목록이에요</p>
            <p className="text-caution/80">업종마다 정상 지표 범위가 달라 직접 확인이 필요해요. 투자 결정은 본인이 하세요.</p>
            {activePreset && (() => {
              const preset = PRESETS.find(p => p.name === activePreset);
              return preset?.caveat ? (
                <p className="mt-2 pt-2 border-t border-caution/20 text-caution/80">{preset.caveat}</p>
              ) : null;
            })()}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted">{results.length}개 종목을 찾았어요</p>
          </div>

          <div className="md:hidden space-y-3">
            {results.map(stock => (
              <button
                key={stock.code}
                onClick={() => onDetailClick(stock)}
                className="w-full text-left bg-surface border border-line rounded-xl p-4 hover:border-ink transition-colors"
              >
                {/* M1 — market_opinion 판정 뱃지 제거(R2). 필터 결과에 판정까지 붙으면
                    "조건에 맞은 종목"이 "사도 되는 종목"으로 읽힌다. PER/PBR/ROE 수치만 남긴다. */}
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-bold text-ink">{stock.name}</p>
                    <p className="text-xs text-faint tabular-nums">{stock.code} · {stock.category}</p>
                  </div>
                </div>
                <p className="text-lg font-black mb-2 text-ink tabular-nums">₩{stock.price?.toLocaleString()}</p>
                {renderPresetMetric(stock) && (
                  <p className="text-xs text-ink font-bold mb-2 bg-inset border border-line rounded-lg px-2 py-1 inline-block">
                    {renderPresetMetric(stock)}
                  </p>
                )}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-muted">PER <span className="text-faint">(낮을수록↓)</span></p>
                    <p className={`tabular-nums ${stock.per && stock.per < 15 ? 'text-ink font-bold' : 'text-muted'}`}>
                      {stock.per ? `${stock.per}배` : '---'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted">PBR <span className="text-faint">(1이하↓)</span></p>
                    <p className={`tabular-nums ${stock.pbr && stock.pbr <= 1 ? 'text-ink font-bold' : 'text-muted'}`}>
                      {stock.pbr ? `${stock.pbr}배` : '---'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted">ROE <span className="text-faint">(높을수록↑)</span></p>
                    <p className={`tabular-nums ${stock.roe && stock.roe >= 15 ? 'text-ink font-bold' : 'text-muted'}`}>
                      {stock.roe ? `${stock.roe}%` : '---'}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="hidden md:block bg-surface border border-line rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="text-left px-5 py-4 text-xs font-bold text-muted">종목</th>
                    <th className="text-right px-4 py-4 text-xs font-bold text-muted">현재가</th>
                    <th className="text-right px-4 py-4 text-xs font-bold text-muted">PER (낮을수록 저평가)</th>
                    <th className="text-right px-4 py-4 text-xs font-bold text-muted">PBR (1이하 저평가)</th>
                    {/* M3 — '우량'은 가치 판정어라 사실 서술로 교체. */}
                    <th className="text-right px-4 py-4 text-xs font-bold text-muted">ROE (자기자본 대비 이익)</th>
                    {/* M1 — '의견'(market_opinion) 열 제거(R2). 정렬용 내부 계산은 서버에 그대로 남는다. */}
                  </tr>
                </thead>
                <tbody>
                  {results.map(stock => (
                    <tr
                      key={stock.code}
                      onClick={() => onDetailClick(stock)}
                      className="border-b border-line hover:bg-inset cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-4">
                        <p className="font-bold text-ink">{stock.name}</p>
                        <p className="text-xs text-faint tabular-nums">{stock.code} · {stock.category}</p>
                        {renderPresetMetric(stock) && (
                          <p className="text-xs text-ink font-bold mt-1 inline-block bg-inset border border-line rounded px-1.5 py-0.5">
                            {renderPresetMetric(stock)}
                          </p>
                        )}
                      </td>
                      <td className="text-right px-4 py-4 font-bold text-ink tabular-nums">₩{stock.price?.toLocaleString()}</td>
                      <td className="text-right px-4 py-4">
                        <span className={`tabular-nums ${stock.per && stock.per < 15 ? 'text-ink font-bold' : 'text-muted'}`}>
                          {stock.per ? `${stock.per}배` : '---'}
                        </span>
                      </td>
                      <td className="text-right px-4 py-4">
                        <span className={`tabular-nums ${stock.pbr && stock.pbr <= 1 ? 'text-ink font-bold' : 'text-muted'}`}>
                          {stock.pbr ? `${stock.pbr}배` : '---'}
                        </span>
                      </td>
                      <td className="text-right px-4 py-4">
                        <span className={`tabular-nums ${stock.roe && stock.roe >= 15 ? 'text-ink font-bold' : 'text-muted'}`}>
                          {stock.roe ? `${stock.roe}%` : '---'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
