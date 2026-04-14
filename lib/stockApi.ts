import axios from 'axios';
import { getDeviceId } from './deviceId';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api';

export { API_BASE_URL };

// Register interceptors once (client-side only)
let interceptorsRegistered = false;
function ensureInterceptors() {
  if (interceptorsRegistered || typeof window === 'undefined') return;
  interceptorsRegistered = true;

  axios.interceptors.request.use((config) => {
    const id = getDeviceId();
    if (id) config.headers['X-Device-Id'] = id;
    return config;
  });

  axios.interceptors.response.use(
    (response) => response,
    async (error) => {
      const url = error.config?.url || '';
      const silent = url.includes('/health') || url.includes('/search') || url.includes('/unread-count');
      if (!silent) {
        try {
          const { useToastStore } = await import('@/stores/useToastStore');
          const msg = error.response?.data?.error || '서버와 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.';
          useToastStore.getState().addToast(msg, 'error');
        } catch {}
      }
      return Promise.reject(error);
    },
  );
}

if (typeof window !== 'undefined') ensureInterceptors();

export const stockApi = {
  getCurrentPrice: async (code: string) => (await axios.get(`${API_BASE_URL}/stock/${code}`)).data,
  getRecommendations: async () => (await axios.get(`${API_BASE_URL}/recommendations`)).data,
  getHoldings: async () => (await axios.get(`${API_BASE_URL}/holdings`)).data,
  addHolding: async (stock: { code: string; name: string; avgPrice: number; weight: number; quantity?: number }) =>
    (await axios.post(`${API_BASE_URL}/holdings`, stock)).data,
  updateHolding: async (stock: { code: string; avgPrice: number; quantity?: number }) =>
    (await axios.put(`${API_BASE_URL}/holdings/${stock.code}`, { avgPrice: stock.avgPrice, quantity: stock.quantity })).data,
  deleteHolding: async (code: string) => (await axios.delete(`${API_BASE_URL}/holdings/${code}`)).data,
  searchStocks: async (query: string) => (await axios.get(`${API_BASE_URL}/search`, { params: { q: query } })).data,
  getAllStocks: async () => (await axios.get(`${API_BASE_URL}/stocks`)).data,
  addStock: async (code: string) => (await axios.post(`${API_BASE_URL}/stocks`, { code })).data,
  deleteStock: async (code: string) => (await axios.delete(`${API_BASE_URL}/stocks/${code}`)).data,
  getHoldingsHistory: async () => (await axios.get(`${API_BASE_URL}/holdings/history`)).data,
  getVolatility: async (code: string) => (await axios.get(`${API_BASE_URL}/stock/${code}/volatility`)).data,
  refreshStock: async (code: string) => (await axios.post(`${API_BASE_URL}/stock/${code}/refresh`)).data,
  getAlerts: async () => (await axios.get(`${API_BASE_URL}/alerts`)).data,
  getUnreadAlertCount: async () => (await axios.get(`${API_BASE_URL}/alerts/unread-count`)).data,
  markAlertsRead: async () => (await axios.post(`${API_BASE_URL}/alerts/read`)).data,
  deleteAlert: async (id: number) => (await axios.delete(`${API_BASE_URL}/alerts/${id}`)).data,
  getMarketIndices: async () => (await axios.get(`${API_BASE_URL}/market/indices`)).data,
  getWatchlist: async () => (await axios.get(`${API_BASE_URL}/watchlist`)).data,
  addToWatchlist: async (code: string) => (await axios.post(`${API_BASE_URL}/watchlist`, { code })).data,
  removeFromWatchlist: async (code: string) => (await axios.delete(`${API_BASE_URL}/watchlist/${code}`)).data,
  getIndicators: async (code: string) => (await axios.get(`${API_BASE_URL}/stock/${code}/indicators`)).data,
  screener: async (filters: Record<string, string | number>) => (await axios.get(`${API_BASE_URL}/screener`, { params: filters })).data,
  getFinancials: async (code: string) => (await axios.get(`${API_BASE_URL}/stock/${code}/financials`)).data,
  getNews: async (code: string) => (await axios.get(`${API_BASE_URL}/stock/${code}/news`)).data,
  getSectorComparison: async (category: string) => (await axios.get(`${API_BASE_URL}/sector/${encodeURIComponent(category)}/compare`)).data,
  getChartData: async (code: string, timeframe: 'weekly' | 'monthly') =>
    (await axios.get(`${API_BASE_URL}/stock/${code}/chart/${timeframe}`)).data,
  getHealth: async () => {
    // 25s: Render free-tier cold start(30~50s) 대응. HealthGate는 fetch+AbortController 직접 사용.
    const r = await axios.get(`${API_BASE_URL}/health`, { timeout: 25000 });
    return r.data as { api: boolean; database: boolean; lastSync: string | null };
  },
};
