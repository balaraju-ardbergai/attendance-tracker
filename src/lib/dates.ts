// All dates in the system are pinned to UTC midnight so a calendar day is
// represented identically on server, client and in the database (@db.Date).

const pad = (n: number) => String(n).padStart(2, "0");

/** The server's local calendar date as "YYYY-MM-DD". */
export function serverTodayKey(): string {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
}

/** The server's local calendar date as a UTC-midnight Date (for @db.Date columns). */
export function serverTodayUtc(): Date {
  return new Date(`${serverTodayKey()}T00:00:00.000Z`);
}

/** UTC-midnight Date -> "YYYY-MM-DD". */
export function toKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" -> UTC-midnight Date. */
export function fromKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

export function addDaysKey(key: string, days: number): string {
  const d = fromKey(key);
  d.setUTCDate(d.getUTCDate() + days);
  return toKey(d);
}

/** "2026-10-26" -> "26 Oct 2026" (client-safe, no TZ shifting). */
export function formatKey(key: string, withYear = true): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [y, m, d] = key.split("-").map(Number);
  return withYear ? `${d} ${months[m - 1]} ${y}` : `${d} ${months[m - 1]}`;
}

export function monthLabel(year: number, month: number): string {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[month]} ${year}`;
}

/** Weekday keys (Mon–Fri) of a month, optionally capped at `upToKey` inclusive. */
export function workingDayKeysOfMonth(year: number, month: number, upToKey?: string): string[] {
  const keys: string[] = [];
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  for (let day = 1; day <= lastDay; day++) {
    const date = new Date(Date.UTC(year, month, day));
    const dow = date.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const key = toKey(date);
    if (upToKey && key > upToKey) break;
    keys.push(key);
  }
  return keys;
}

/** Weekday keys inside [startKey, endKey] that fall in the given month. */
export function workingDayKeysInRange(startKey: string, endKey: string, year: number, month: number): string[] {
  return workingDayKeysOfMonth(year, month).filter((k) => k >= startKey && k <= endKey);
}

export type MonthStats = {
  workingDays: number;
  present: number;
  leave: number;
  wfh: number;
  absent: number;
};

/** Aggregates attendance records for a month. Today is only counted as absent once marked. */
export function computeMonthStats(
  records: { date: Date; status: string }[],
  year: number,
  month: number,
): MonthStats {
  const todayKey = serverTodayKey();
  const elapsed = workingDayKeysOfMonth(year, month, todayKey);
  const byKey = new Map(records.map((r) => [toKey(r.date), r.status]));

  let present = 0;
  let leave = 0;
  let wfh = 0;
  for (const key of elapsed) {
    const status = byKey.get(key);
    if (status === "PRESENT") present++;
    else if (status === "LEAVE") leave++;
    else if (status === "WFH") wfh++;
  }

  const effective = elapsed.filter((k) => !(k === todayKey && !byKey.has(k)));
  const covered = present + leave + wfh;
  return {
    workingDays: effective.length,
    present,
    leave,
    wfh,
    absent: Math.max(0, effective.length - covered),
  };
}
