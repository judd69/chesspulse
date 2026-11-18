import { describe, it, expect } from 'vitest';
import { lookupOpening } from '../src/eco';
import {
  loadStats,
  saveStats,
  loadArchive,
  upsertArchiveRecord,
  currentStreak,
  averageSolveSeconds,
  lastNDays,
} from '../src/storage';

describe('ECO mini-table', () => {
  it('names the Najdorf', () => {
    const sans = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'];
    const e = lookupOpening(sans);
    expect(e?.name).toContain('Najdorf');
    expect(e?.eco).toBe('B90');
  });
  it('names the French Advance', () => {
    const e = lookupOpening(['e4', 'e6', 'd4', 'd5', 'e5', 'c5']);
    expect(e?.name).toContain('French');
  });
  it('returns null for an unlisted opening', () => {
    expect(lookupOpening(['a4', 'h5'])).toBeNull();
  });
  it('prefers the longest match', () => {
    const e = lookupOpening(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7']);
    expect(e?.eco).toBe('C78');
  });
});

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
}

describe('local stats + archive', () => {
  it('starts empty and round-trips', () => {
    const store = new MemoryStorage();
    const s = loadStats(store);
    expect(s.solved).toBe(0);
    s.solved = 3;
    s.totalSeconds = 300;
    saveStats(s, store);
    expect(loadStats(store).solved).toBe(3);
    expect(averageSolveSeconds(loadStats(store))).toBe(100);
  });

  it('streak counts consecutive solved days ending today', () => {
    const store = new MemoryStorage();
    const mk = (date: string): import('../src/storage').DayRecord => ({
      date, puzzleId: 'x', rating: 1500, solved: true, seconds: 60, heartsLeft: 5,
    });
    upsertArchiveRecord(mk('2026-11-17'), store);
    upsertArchiveRecord(mk('2026-11-16'), store);
    upsertArchiveRecord(mk('2026-11-15'), store);
    upsertArchiveRecord(mk('2026-11-13'), store); // gap on the 14th
    expect(currentStreak(loadArchive(store), '2026-11-17')).toBe(3);
    expect(currentStreak(loadArchive(store), '2026-11-18')).toBe(3); // today unsolved, streak from yesterday
  });

  it('lastNDays flags solved days', () => {
    const store = new MemoryStorage();
    upsertArchiveRecord({ date: '2026-11-17', puzzleId: 'x', rating: 1500, solved: true, seconds: 60, heartsLeft: 5 }, store);
    const days = lastNDays(loadArchive(store), 3, '2026-11-17');
    expect(days).toHaveLength(3);
    expect(days[2]).toEqual({ date: '2026-11-17', solved: true });
    expect(days[1]).toEqual({ date: '2026-11-16', solved: false });
  });
});
