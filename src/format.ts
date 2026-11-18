// Small formatting helpers (pure, tested).

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function formatSecondsShort(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return sec === 0 ? `${m}m` : `${m}m ${sec}s`;
}

export function formatDateShort(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function formatDateLong(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Convert a centipawn score to a white win probability (0..1), Lichess-style logistic. */
export function cpToWinProb(cp: number): number {
  return 0.5 + 0.5 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** Eval bar fill: percent of the bar that is white. Mate scores clamp to the edge. */
export function evalBarWhitePercent(cp: number | null, mate: number | null): number {
  if (mate !== null && mate !== undefined) {
    return mate > 0 ? 100 : 0;
  }
  if (cp === null || cp === undefined) return 50;
  const p = cpToWinProb(cp);
  return Math.round(p * 100);
}

export function evalText(cp: number | null, mate: number | null): string {
  if (mate !== null && mate !== undefined) {
    return mate > 0 ? `#${mate}` : `#${mate}`;
  }
  if (cp === null || cp === undefined) return '—';
  return (cp / 100).toFixed(2).replace('-0.00', '0.00');
}

export function flagEmoji(country?: string): string {
  if (!country || country.length !== 2) return '';
  const code = country.toUpperCase();
  return String.fromCodePoint(
    ...[...code].map((c) => 127397 + c.charCodeAt(0)),
  );
}
