'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, X, Check } from 'lucide-react';
import { stockApi } from '@/lib/stockApi';

interface HealthStatus {
  api: boolean;
  database: boolean;
  lastSync: string | null;
}

interface DirectoryHit {
  code: string;
  name: string;
  market: string;
}

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';

export default function SettingsPage() {
  const [nickname, setNickname] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedHit, setSelectedHit] = useState<DirectoryHit | null>(null);
  const [directoryResults, setDirectoryResults] = useState<DirectoryHit[]>([]);
  const [isSearchingDir, setIsSearchingDir] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  useEffect(() => {
    setNickname(localStorage.getItem('nickname') || '');
  }, []);

  const onNicknameChange = (n: string) => {
    setNickname(n);
    localStorage.setItem('nickname', n);
  };

  const checkHealth = async () => {
    setHealthLoading(true);
    try {
      const data = await stockApi.getHealth();
      setHealth(data);
    } catch {
      setHealth({ api: false, database: false, lastSync: null });
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  // 디렉토리 자동완성 — 2자 이상 입력 시 250ms 디바운스로 stocks_directory 검색.
  // 6자리 숫자 코드만 입력한 경우엔 검색 결과 비움 (폴백으로 직접 코드 사용).
  useEffect(() => {
    if (selectedHit) return; // 이미 선택됨 — 드롭다운 숨김
    const q = searchQuery.trim();
    if (q.length < 2 || /^\d{1,6}$/.test(q)) {
      setDirectoryResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingDir(true);
      try {
        const rows = await stockApi.searchDirectory(q);
        setDirectoryResults(rows);
      } catch {
        setDirectoryResults([]);
      } finally {
        setIsSearchingDir(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedHit]);

  const pickHit = (hit: DirectoryHit) => {
    setSelectedHit(hit);
    setSearchQuery(`${hit.name} (${hit.code})`);
    setDirectoryResults([]);
  };

  const clearSelection = () => {
    setSelectedHit(null);
    setSearchQuery('');
    setDirectoryResults([]);
  };

  // 제출 시 code 결정 로직:
  //   1) 드롭다운에서 선택한 경우 → selectedHit.code
  //   2) 선택 없이 6자리 숫자 직접 입력 → searchQuery (폴백, 기존 동작 유지)
  const resolveCode = (): string => {
    if (selectedHit) return selectedHit.code;
    const raw = searchQuery.trim();
    if (/^\d{6}$/.test(raw)) return raw;
    return '';
  };

  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault();

    const code = resolveCode();
    if (!code) {
      setMessage({
        type: 'error',
        text: '종목을 드롭다운에서 선택하거나 6자리 종목 코드를 입력해 주세요.',
      });
      return;
    }

    setMessage(null);
    setIsAdding(true);

    try {
      console.log('[종목 추가] 시작:', code);

      // 네이버 API로 종목 데이터 크롤링 후 DB 추가 (getStockData 업서트)
      const result = await stockApi.addStock(code);

      console.log('[종목 추가] 성공:', result);

      setMessage({
        type: 'success',
        text: `${result.name} (${result.code})이(가) 전체 종목 목록에 추가되었습니다!`,
      });

      clearSelection();
    } catch (error: unknown) {
      console.error('[종목 추가] 실패:', error);
      const axiosError = error as { response?: { data?: { error?: string } } };
      setMessage({
        type: 'error',
        text: axiosError.response?.data?.error || '종목 추가에 실패했습니다. 종목 코드를 확인해주세요.',
      });
    } finally {
      setIsAdding(false);
    }
  };

  const apiOk = health?.api ?? false;
  const dbOk = health?.database ?? false;
  const lastSyncText = health?.lastSync
    ? new Date(health.lastSync).toLocaleString('ko-KR')
    : '확인 불가';

  return (
    <div className="max-w-2xl animate-in slide-in-from-bottom-4 duration-500">
      <h2 className="text-2xl font-bold text-ink mb-4">API & 계정 설정</h2>
      <p className="text-sm text-muted mb-8 leading-relaxed">
        앱에서 사용하는 데이터 연결 상태를 확인하고, 새로운 종목을 추가할 수 있는 페이지입니다.
      </p>

      <div className="space-y-6">
        <div className="bg-surface border border-line rounded-xl p-6">
          <h3 className="text-lg font-semibold text-ink mb-6">종목 수동 추가</h3>

          <p className="text-sm text-muted mb-6 leading-relaxed">
            DB에 없는 새로운 종목을 추가합니다. 종목명(예: 삼성전자) 또는 6자리 코드(예: 005930)를 입력하면 네이버 금융 API에서 데이터를 가져와 자동으로 등록합니다.
          </p>

          <form onSubmit={handleAddStock} className="space-y-4">
            <div className="relative">
              <div className="flex items-center bg-surface border border-line-strong rounded-xl px-4 py-3 focus-within:border-ink transition-colors">
                <input
                  type="text"
                  placeholder="종목명 또는 코드 입력 (예: 삼성전자, 005930)"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (selectedHit) setSelectedHit(null);
                  }}
                  disabled={isAdding}
                  maxLength={40}
                  className="bg-transparent border-none focus:outline-none text-sm w-full text-ink placeholder:text-faint disabled:opacity-60"
                />
                {isSearchingDir && <RefreshCw size={14} className="animate-spin text-faint ml-2" />}
                {isAdding && <RefreshCw size={16} className="animate-spin text-ink ml-2" />}
              </div>

              {!selectedHit && directoryResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-line rounded-xl shadow-lg overflow-hidden z-20">
                  {directoryResults.map((hit) => (
                    <button
                      key={hit.code}
                      type="button"
                      onClick={() => pickHit(hit)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-inset transition-colors border-b border-line last:border-0 text-left"
                    >
                      <div>
                        <p className="text-sm font-bold text-ink">{hit.name}</p>
                        <p className="text-xs text-faint tabular-nums">{hit.code}</p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded border border-line ${
                        hit.market === 'KOSPI' ? 'bg-inset text-ink' :
                        hit.market === 'KOSDAQ' ? 'bg-inset text-muted' :
                        'bg-inset text-faint'
                      }`}>{hit.market}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedHit && (
              <div className="flex items-center justify-between p-3 bg-inset border border-line rounded-xl">
                <div className="flex items-center space-x-2 text-sm text-ink">
                  <Check size={14} />
                  <span className="font-bold">{selectedHit.name}</span>
                  <span className="text-faint tabular-nums">({selectedHit.code})</span>
                  <span className="text-faint">·</span>
                  <span className="text-muted">{selectedHit.market}</span>
                </div>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-faint hover:text-ink p-1 min-w-[24px] min-h-[24px] flex items-center justify-center"
                  aria-label="선택 취소"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {isAdding && (
              <div className="p-3 bg-inset border border-line rounded-xl text-sm text-muted flex items-center space-x-2">
                <RefreshCw size={14} className="animate-spin" />
                <span>네이버 API에서 종목 데이터를 가져오는 중...</span>
              </div>
            )}

            {message && (
              <div className={`p-4 rounded-xl text-sm font-medium border ${
                message.type === 'success'
                  ? 'bg-inset text-ink border-line'
                  : 'bg-caution/10 text-caution border-caution/20'
              }`}>
                {message.text}
              </div>
            )}

            <button
              type="submit"
              disabled={isAdding || (!selectedHit && !/^\d{6}$/.test(searchQuery.trim()))}
              className="w-full py-3 min-h-[44px] bg-ink hover:opacity-90 disabled:bg-inset disabled:text-faint text-surface rounded-xl text-sm font-bold transition-opacity"
            >
              {isAdding ? '추가 중...' : '종목 추가'}
            </button>
          </form>

          <p className="text-xs text-faint mt-4 leading-relaxed">
            종목명은 KRX 상장법인목록 기준이에요. 드롭다운에서 찾아지지 않으면 네이버 금융에서 6자리 코드를 확인해 직접 입력해 주세요.
          </p>
        </div>

        <div className="bg-surface border border-line rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-ink">데이터 연결 상태</h3>
            <button
              onClick={checkHealth}
              disabled={healthLoading}
              className="text-xs text-ink flex items-center space-x-1 px-3 py-2 min-h-[44px] rounded-xl border border-line-strong hover:bg-inset transition-colors"
            >
              <RefreshCw size={14} className={healthLoading ? 'animate-spin' : ''} />
              <span>상태 확인</span>
            </button>
          </div>

          <p className="text-sm text-muted mb-4 leading-relaxed">
            주가, 재무제표, 투자자 매매동향 등의 데이터를 네이버 증권에서 자동으로 가져옵니다. 별도 가입이나 인증키 없이 바로 사용 가능합니다.
          </p>

          {healthLoading ? (
            <div className="flex items-center justify-center py-8 text-muted text-sm">
              <RefreshCw size={16} className="animate-spin mr-2" />
              연결 상태를 확인하고 있습니다...
            </div>
          ) : (
            <div className="divide-y divide-line">
              <div className="flex items-center justify-between py-3 min-h-[52px]">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-ink">네이버 증권 API</span>
                  <span className="text-xs text-faint">실시간 주가 데이터 소스</span>
                </div>
                <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${apiOk ? 'bg-inset text-ink border-line' : 'bg-caution/10 text-caution border-caution/20'}`}>
                  {apiOk ? '정상 연결됨' : '연결 실패'}
                </span>
              </div>
              <div className="flex items-center justify-between py-3 min-h-[52px]">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-ink">로컬 데이터베이스</span>
                  <span className="text-xs text-faint">종목·히스토리·분석 결과 저장소</span>
                </div>
                <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${dbOk ? 'bg-inset text-ink border-line' : 'bg-caution/10 text-caution border-caution/20'}`}>
                  {dbOk ? '정상' : '오류'}
                </span>
              </div>
              <div className="flex items-center justify-between py-3 min-h-[52px]">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-ink">마지막 데이터 갱신</span>
                  <span className="text-xs text-faint">매일 오전 8시 자동 업데이트</span>
                </div>
                <span className="text-xs font-bold px-3 py-1.5 bg-inset text-muted border border-line rounded-full tabular-nums">
                  {lastSyncText}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="bg-surface border border-line rounded-xl p-6">
          <h3 className="text-lg font-semibold text-ink mb-6">내 프로필</h3>
          <p className="text-sm text-muted mb-4 leading-relaxed">
            앱에서 표시할 이름을 설정하세요. 비워두면 기본값 "투자자"로 표시됩니다.
          </p>
          <div className="flex items-center space-x-3">
            <input
              type="text"
              placeholder="닉네임 입력 (예: 김투자)"
              value={nickname}
              onChange={(e) => onNicknameChange(e.target.value)}
              maxLength={10}
              className="flex-1 bg-surface border border-line-strong rounded-xl px-4 py-3 text-sm text-ink focus:outline-none focus:border-ink placeholder:text-faint"
            />
            <span className="text-xs text-faint shrink-0 tabular-nums">{nickname.length}/10</span>
          </div>
        </div>

        <div className="p-4 bg-surface border border-line rounded-xl flex items-center justify-between">
          <span className="text-sm text-muted tabular-nums">현재 버전: v{APP_VERSION}</span>
          <button
            onClick={checkHealth}
            className="text-ink text-sm font-bold hover:underline px-4 py-3 min-h-[44px]"
          >
            연결 상태 재확인
          </button>
        </div>
      </div>
    </div>
  );
}
