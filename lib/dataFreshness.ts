function parseServerDate(input: string): Date {
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(input)) return new Date(input);
  return new Date(input.replace(' ', 'T') + 'Z');
}

function getKSTNow() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const kst = new Date(utcMs + 9 * 60 * 60000);
  return { day: kst.getUTCDay(), hour: kst.getUTCHours() };
}

export function getDataFreshnessLabel(lastUpdated: string | null | undefined): string {
  if (!lastUpdated) return '데이터 없음';

  const updated = parseServerDate(lastUpdated);
  const diffMs = Date.now() - updated.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  const { day, hour } = getKSTNow();
  const isWeekday = day >= 1 && day <= 5;
  const isMarketHours = isWeekday && hour >= 9 && hour < 16;

  const timeStr = updated.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' });
  const contextLabel = isMarketHours ? '장중 데이터' : '전일 종가';

  if (diffMin < 1) return `방금 (${timeStr}, ${contextLabel})`;
  if (diffMin < 60) return `${diffMin}분 전 (${timeStr}, ${contextLabel})`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}시간 전 (${timeStr}, ${contextLabel})`;
  return `${Math.floor(diffMin / 1440)}일 전 (${timeStr}, ${contextLabel})`;
}

export function getDataFreshnessShort(lastUpdated: string | null | undefined): string {
  if (!lastUpdated) return '';
  const diffMs = Date.now() - parseServerDate(lastUpdated).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return '방금';
  if (mins < 60) return `${mins}분 전`;
  if (mins < 1440) return `${Math.floor(mins / 60)}시간 전`;
  return `${Math.floor(mins / 1440)}일 전`;
}
