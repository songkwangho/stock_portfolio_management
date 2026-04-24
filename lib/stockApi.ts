import axios, { type InternalAxiosRequestConfig } from 'axios';
import { getDeviceId } from './deviceId';

// 5xx 1회 자동 재시도용 플래그 (TS: AxiosRequestConfig에 _retry 필드 확장)
type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

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
    // 모든 요청 기본 타임아웃 30s — Render cold start + 스크래핑 지연 보호
    if (config.timeout === 0 || config.timeout === undefined) config.timeout = 30000;
    return config;
  });

  axios.interceptors.response.use(
    (response) => response,
    async (error) => {
      const url = error.config?.url || '';
      const status = error.response?.status as number | undefined;
      const config = error.config as RetryConfig | undefined;

      // 5xx 서버 오류 시 1회 자동 재시도 (2초 대기) — Render cold start·일시 장애 자가 복구
      if (status && status >= 500 && config && !config._retry) {
        config._retry = true;
        await new Promise(r => setTimeout(r, 2000));
        try {
          return await axios.request(config);
        } catch {
          // 재시도 실패 시 아래 토스트 로직으로 진행
        }
      }

      // 보조 정보 폴링은 실패해도 사용자 흐름 방해 없음 → 토스트 억제
      const silent =
        url.includes('/health') ||
        url.includes('/search') ||
        url.includes('/unread-count') ||
        url.includes('/market/indices') ||
        url.includes('/volatility') ||
        url.includes('/news');
      if (!silent) {
        try {
          const { useToastStore } = await import('@/stores/useToastStore');
          const friendly =
            status === 400 ? '입력 값을 다시 확인해 주세요.' :
            status === 401 ? '로그인이 필요해요.' :
            status === 404 ? '요청한 데이터를 찾을 수 없어요.' :
            status === 429 ? '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.' :
            status && status >= 500 ? '서버에 일시적인 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' :
            '연결에 문제가 생겼어요. 인터넷 연결을 확인해 주세요.';
          useToastStore.getState().addToast(friendly, 'error');
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
  searchDirectory: async (query: string): Promise<Array<{ code: string; name: string; market: string }>> =>
    (await axios.get(`${API_BASE_URL}/stocks/directory/search`, { params: { q: query } })).data,
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
