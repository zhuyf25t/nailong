/** Display an elapsed duration without rounding a faster run into a slower one. */
export function formatElapsed(elapsedMs: number): string {
  const tenths = Math.floor(elapsedMs / 100);
  const seconds = Math.floor(tenths / 10);
  if (seconds < 60) return `${seconds}.${tenths % 10} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${String(seconds % 60).padStart(2, '0')}.${tenths % 10} 秒`;
}

export function formatAccuracy(hits: number, shotsFired: number): string {
  return shotsFired === 0 ? '—' : `${(hits / shotsFired * 100).toFixed(1)}%`;
}

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});
export function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}
