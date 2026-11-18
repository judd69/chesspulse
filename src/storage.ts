// ChessPulse — local stats, streaks, archive (localStorage, no account).
// Everything here lives on the user's own device, per the brief §1.7.

export interface DayRecord {
  date: string; // YYYY-MM-DD
  puzzleId: string;
  rating: number;
  solved: boolean;
  seconds: number | null;
  heartsLeft: number | null;
}

export interface LocalStats {
  solved: number;
  bestStreak: number;
  totalSeconds: number;
  rushBest: number;
  lastSolvedDate: string | null;
}

const STATS_KEY = 'chesspulse.stats.v1';
const ARCHIVE_KEY = 'chesspulse.archive.v1';

export function loadStats(store: Storage = localStorage): LocalStats {
  try {
    const raw = store.getItem(STATS_KEY);
    if (raw) return JSON.parse(raw) as LocalStats;
  } catch {
    /* fall through */
  }
  return { solved: 0, bestStreak: 0, totalSeconds: 0, rushBest: 0, lastSolvedDate: null };
}

export function saveStats(s: LocalStats, store: Storage = localStorage): void {
  try {
    store.setItem(STATS_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable (private mode) — stats simply don't persist */
  }
}

export function loadArchive(store: Storage = localStorage): DayRecord[] {
  try {
    const raw = store.getItem(ARCHIVE_KEY);
    if (raw) return JSON.parse(raw) as DayRecord[];
  } catch {
    /* fall through */
  }
  return [];
}

export function saveArchive(records: DayRecord[], store: Storage = localStorage): void {
  try {
    store.setItem(ARCHIVE_KEY, JSON.stringify(records));
  } catch {
    /* ignore */
  }
}

export function upsertArchiveRecord(rec: DayRecord, store: Storage = localStorage): DayRecord[] {
  const records = loadArchive(store).filter((r) => r.date !== rec.date);
  records.push(rec);
  records.sort((a, b) => (a.date < b.date ? 1 : -1));
  saveArchive(records, store);
  return records;
}

/** Current streak: consecutive days ending today (or yesterday if today not yet solved). */
export function currentStreak(records: DayRecord[], todayKey: string): number {
  const solvedDates = new Set(records.filter((r) => r.solved).map((r) => r.date));
  let streak = 0;
  let d = new Date(todayKey + 'T12:00:00');
  if (!solvedDates.has(todayKey)) {
    d.setDate(d.getDate() - 1);
  }
  for (;;) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!solvedDates.has(key)) break;
    streak++;
    d.setDate(d.getDate() - 1);
    if (streak > 3650) break;
  }
  return streak;
}

export function averageSolveSeconds(stats: LocalStats): number | null {
  if (stats.solved === 0) return null;
  return Math.round(stats.totalSeconds / stats.solved);
}

/** Last N days (ending today) with solved flags, for the streak calendar. */
export function lastNDays(records: DayRecord[], n: number, todayKey: string): { date: string; solved: boolean }[] {
  const solvedDates = new Set(records.filter((r) => r.solved).map((r) => r.date));
  const out: { date: string; solved: boolean }[] = [];
  const d = new Date(todayKey + 'T12:00:00');
  for (let i = n - 1; i >= 0; i--) {
    const day = new Date(d);
    day.setDate(d.getDate() - i);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    out.push({ date: key, solved: solvedDates.has(key) });
  }
  return out;
}
