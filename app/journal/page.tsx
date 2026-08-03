'use client';

// 4.5b차 — 거래일지: 증권사 거래내역 CSV 업로드 → 매매 통계 + 4대 행동편향 관찰.
// 안전: 원본 CSV는 서버에 저장되지 않고(파싱 즉시 폐기), PII는 파서에서 제거된다.
// 톤: 판정이 아니라 관찰. 전 영역 무채색(방향색 금지) + "실증 검증 전" 뱃지 + 면책 각주.
import { useState, useEffect, useCallback } from 'react';
import { Upload, Trash2, FileText } from 'lucide-react';
import { stockApi } from '@/lib/stockApi';
import { readBiases, journalCoverageNotes, readOpenLossHeadline, JOURNAL_DISCLAIMER, type JournalBias } from '@/lib/journal/interpret';
import type { JournalAnalysis, JournalUploadResult, JournalSummary } from '@/types/stock';

// File → 텍스트. 한국 증권사 CSV는 EUC-KR(CP949)이 흔함 → euc-kr 우선, BOM/대체문자 시 utf-8 폴백.
async function decodeCsv(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return new TextDecoder('utf-8').decode(buf);
  const utf8 = new TextDecoder('utf-8').decode(buf);
  let euckr = '';
  try { euckr = new TextDecoder('euc-kr').decode(buf); } catch { return utf8; }
  const bad = (s: string) => (s.match(/�/g) || []).length;
  return bad(euckr) <= bad(utf8) ? euckr : utf8;
}

const won = (n: number) => `${Math.round(n).toLocaleString()}원`;
const BROKERS = [
  { v: '', label: '자동 감지' },
  { v: 'kiwoom', label: '키움증권' },
  { v: 'toss', label: '토스증권' },
  { v: 'samsung', label: '삼성증권' },
];

function SummaryTable({ s }: { s: JournalSummary }) {
  const rows: [string, string][] = [
    ['청산 거래', `${s.roundtripCount}건`],
    ['이익 실현 비율', s.winRate == null ? '—' : `${s.winRate}%`],
    ['이익 종목 평균 보유', s.avgHoldWin == null ? '—' : `${s.avgHoldWin}일`],
    ['손실 종목 평균 보유', s.avgHoldLoss == null ? '—' : `${s.avgHoldLoss}일`],
    ['손익비 (이익합÷손실합)', s.profitFactor == null ? '—' : `${s.profitFactor}`],
    ['누적 실현손익', won(s.totalPnl)],
    ['최대 낙폭 (실현손익 기준)', won(s.maxDrawdown)],
  ];
  return (
    <div className="bg-surface border border-line rounded-xl overflow-hidden">
      {rows.map(([k, v], i) => (
        <div key={k} className={`flex justify-between items-center px-4 py-2.5 ${i > 0 ? 'border-t border-line' : ''}`}>
          <span className="text-sm text-muted break-keep">{k}</span>
          <span className="text-sm font-bold text-ink tabular-nums">{v}</span>
        </div>
      ))}
    </div>
  );
}

export default function JournalPage() {
  const [broker, setBroker] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<JournalUploadResult | null>(null);
  const [analysis, setAnalysis] = useState<JournalAnalysis | null>(null);
  const [message, setMessage] = useState<{ type: 'error' | 'info'; text: string } | null>(null);

  const loadAnalysis = useCallback(async () => {
    try { setAnalysis(await stockApi.getJournalAnalysis()); }
    catch { setAnalysis({ available: false }); }
  }, []);

  useEffect(() => { loadAnalysis(); }, [loadAnalysis]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setMessage(null);
    setUploadResult(null);
    try {
      const csvText = await decodeCsv(file);
      const result = await stockApi.uploadJournal(csvText, broker || undefined);
      setUploadResult(result);
      if (result.imported === 0) {
        setMessage({ type: 'error', text: '거래를 하나도 읽지 못했어요. 증권사 선택을 바꾸거나 다른 파일을 시도해 주세요. (기존 데이터는 그대로 두었어요.)' });
      } else {
        // F1: 업로드는 기존 거래를 새 파일로 교체(append 아님) — 사용자가 인지하도록 명시.
        setMessage({ type: 'info', text: `기존 거래를 새 파일로 교체했어요 — ${result.imported}건 불러왔어요${result.skipped ? ` (분석 대상 밖 ${result.skipped}건은 제외)` : ''}.` });
      }
      await loadAnalysis();
    } catch {
      setMessage({ type: 'error', text: '파일을 처리하지 못했어요. CSV 형식인지 확인해 주세요.' });
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async () => {
    if (!confirm('업로드한 거래내역을 모두 삭제할까요? 되돌릴 수 없어요.')) return;
    try {
      await stockApi.deleteJournal();
      setUploadResult(null);
      setAnalysis({ available: false });
      setMessage({ type: 'info', text: '거래내역을 모두 삭제했어요.' });
    } catch {
      setMessage({ type: 'error', text: '삭제에 실패했어요.' });
    }
  };

  const readings = analysis?.available && analysis.biases ? readBiases(analysis.biases as JournalBias[]) : [];
  const headline = analysis?.available ? readOpenLossHeadline(analysis.summary) : { available: false, text: '' };

  return (
    <div className="max-w-3xl animate-in slide-in-from-bottom-4 duration-500">
      <h2 className="text-2xl font-bold text-ink mb-1">거래 진단</h2>
      <p className="text-sm text-muted mb-5 break-keep">
        증권사 거래내역 CSV를 올리면 내 매매 습관을 관찰형으로 풀어드려요. 판정이 아니라 참고예요.
      </p>

      {/* 업로드 */}
      <div className="bg-surface border border-line rounded-xl p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-muted">증권사</label>
          <select
            value={broker}
            onChange={(e) => setBroker(e.target.value)}
            className="text-sm border border-line rounded-lg px-3 py-2 bg-paper text-ink"
          >
            {BROKERS.map(b => <option key={b.v} value={b.v}>{b.label}</option>)}
          </select>
          <label className={`inline-flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-lg cursor-pointer bg-ink text-paper min-h-[44px] ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
            <Upload size={16} />
            {uploading ? '처리 중…' : 'CSV 올리기'}
            <input type="file" accept=".csv,text/csv" className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])} disabled={uploading} />
          </label>
          {analysis?.available && (
            <button onClick={onDelete} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink px-3 py-2 min-h-[44px]">
              <Trash2 size={15} /> 전체 삭제
            </button>
          )}
        </div>
        <p className="text-xs text-faint mt-3 break-keep">
          원본 파일은 서버에 저장하지 않아요. 계좌번호·예수금·성명 같은 개인정보는 읽는 즉시 버리고, 종목·수량·가격·날짜만 사용해요.
        </p>
      </div>

      {message && (
        <div className={`text-sm rounded-lg px-4 py-2.5 mb-4 break-keep ${message.type === 'error' ? 'bg-caution/10 text-caution' : 'bg-inset text-ink'}`}>
          {message.text}
          {uploadResult?.dateRange && message.type === 'info' && (
            <span className="text-muted"> · {uploadResult.dateRange.from} ~ {uploadResult.dateRange.to}</span>
          )}
        </div>
      )}

      {/* 결과 */}
      {analysis?.available && analysis.summary ? (
        <div className="space-y-5">
          {/* C-2: 미실현 손실 킬러 한 줄 — 결과 최상단. 무채색(방향색 금지), '최근 종가 기준' 명시. */}
          {headline.available && (
            <div data-testid="journal-headline" className="bg-surface border border-line rounded-xl p-4">
              <p className="text-sm text-ink leading-relaxed break-keep">{headline.text}</p>
            </div>
          )}
          <section data-testid="journal-summary">
            <h3 className="text-sm font-bold text-ink mb-2">매매 통계</h3>
            <SummaryTable s={analysis.summary} />
            {journalCoverageNotes(analysis.coverage).map((note, i) => (
              <p key={i} className="text-xs text-faint mt-2 break-keep">※ {note}</p>
            ))}
          </section>

          <section>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-sm font-bold text-ink">행동 관찰</h3>
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-caution/10 text-caution">실증 검증 전</span>
            </div>
            <div className="space-y-2.5">
              {readings.map(r => (
                <div key={r.key} className={`bg-surface border border-line rounded-xl p-4 ${!r.available ? 'opacity-60' : ''}`}>
                  <p className="text-xs font-bold text-muted mb-1">{r.label}</p>
                  <p className="text-sm text-ink leading-relaxed break-keep">{r.text}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-faint mt-2 break-keep">
              ※ 편향 기준값(급등 폭·보유일·매매횟수 등)은 아직 실증 검증 전이에요. 경향을 참고하는 용도로만 봐주세요.
            </p>
          </section>

          <p className="text-xs text-faint break-keep border-t border-line pt-3">{JOURNAL_DISCLAIMER}</p>
        </div>
      ) : (
        <div className="bg-surface border border-line rounded-xl p-8 text-center">
          <FileText size={28} className="mx-auto text-faint mb-3" />
          <p className="text-sm text-muted break-keep">
            아직 올린 거래내역이 없어요. 증권사 앱/HTS에서 거래내역을 CSV로 내려받아 올려보세요.
          </p>
        </div>
      )}
    </div>
  );
}
