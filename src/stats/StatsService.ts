import { Alert } from "../model/Alert";

export interface DashboardStats {
  totalToday: number;
  approved: number;
  denied: number;
  averageResponseMs: number | null;
  peakHour: number | null;
  mostCommonType: string | null;
}

function isSameDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}

function topKey<T>(items: T[], key: (item: T) => string | number): string | number | null {
  const counts = new Map<string | number, number>();
  for (const item of items) {
    const k = key(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let best: string | number | null = null;
  let bestCount = 0;
  for (const [k, count] of counts) {
    if (count > bestCount) {
      best = k;
      bestCount = count;
    }
  }
  return best;
}

export function computeStats(alerts: Alert[], now: number = Date.now()): DashboardStats {
  const today = alerts.filter((a) => isSameDay(a.receivedAt, now));
  const resolved = alerts.filter((a) => typeof a.respondedAt === "number");
  const totalResponse = resolved.reduce((sum, a) => sum + (a.respondedAt! - a.receivedAt), 0);

  return {
    totalToday: today.length,
    approved: today.filter((a) => a.status === "approved").length,
    denied: today.filter((a) => a.status === "denied").length,
    averageResponseMs: resolved.length ? Math.round(totalResponse / resolved.length) : null,
    peakHour: today.length ? (topKey(today, (a) => new Date(a.receivedAt).getHours()) as number) : null,
    mostCommonType: today.length ? (topKey(today, (a) => a.type) as string) : null
  };
}
