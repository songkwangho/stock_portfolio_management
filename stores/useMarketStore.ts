import { create } from 'zustand';
import { stockApi } from '@/lib/stockApi';
import type { MarketIndex } from '@/types/stock';

const TTL_MS = 300_000; // 5분 — HeaderBar 폴링 주기와 일치

interface MarketStore {
  indices: MarketIndex[];
  lastFetch: number;
  inflight: Promise<void> | null;
  fetchIndices: (force?: boolean) => Promise<void>;
}

export const useMarketStore = create<MarketStore>((set, get) => ({
  indices: [],
  lastFetch: 0,
  inflight: null,
  fetchIndices: async (force = false) => {
    const { lastFetch, inflight } = get();
    if (inflight) return inflight;
    if (!force && Date.now() - lastFetch < TTL_MS) return;
    const p = (async () => {
      try {
        const data = await stockApi.getMarketIndices();
        set({ indices: data, lastFetch: Date.now() });
      } catch {
        // silent — UX-U 정책
      } finally {
        set({ inflight: null });
      }
    })();
    set({ inflight: p });
    return p;
  },
}));
