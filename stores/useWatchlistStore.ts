import { create } from 'zustand';
import { stockApi } from '@/lib/stockApi';
import { useToastStore } from './useToastStore';
import type { WatchlistItem } from '@/types/stock';

interface WatchlistState {
  items: WatchlistItem[];
  isLoading: boolean;
  lastFetched: number;
}

interface WatchlistActions {
  fetchWatchlist: (force?: boolean) => Promise<void>;
  addToWatchlist: (code: string) => Promise<void>;
  removeFromWatchlist: (code: string) => Promise<void>;
}

const TTL_MS = 30 * 1000;

export const useWatchlistStore = create<WatchlistState & WatchlistActions>((set, get) => ({
  items: [],
  isLoading: false,
  lastFetched: 0,

  fetchWatchlist: async (force = false) => {
    if (!force && Date.now() - get().lastFetched < TTL_MS) return;
    set({ isLoading: true });
    try {
      const data = await stockApi.getWatchlist();
      set({ items: data, isLoading: false, lastFetched: Date.now() });
    } catch {
      set({ isLoading: false });
    }
  },

  addToWatchlist: async (code) => {
    try {
      await stockApi.addToWatchlist(code);
      await get().fetchWatchlist(true);
    } catch {
      throw new Error('관심종목 추가에 실패했습니다.');
    }
  },

  removeFromWatchlist: async (code) => {
    const previous = get().items;
    set({ items: previous.filter(i => i.code !== code) });
    try {
      await stockApi.removeFromWatchlist(code);
    } catch {
      set({ items: previous });
      useToastStore.getState().addToast('관심종목 삭제에 실패했어요. 다시 시도해 주세요.', 'error');
    }
  },
}));
