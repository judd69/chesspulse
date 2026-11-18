import { describe, it, expect } from 'vitest';
import {
  formatClock,
  formatSecondsShort,
  cpToWinProb,
  evalBarWhitePercent,
  evalText,
  dateKey,
  flagEmoji,
} from '../src/format';

describe('format', () => {
  it('formats clocks', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(134)).toBe('2:14');
  });
  it('formats short durations', () => {
    expect(formatSecondsShort(42)).toBe('42s');
    expect(formatSecondsShort(120)).toBe('2m');
    expect(formatSecondsShort(134)).toBe('2m 14s');
  });
  it('centipawn 0 is a 50/50 position', () => {
    expect(cpToWinProb(0)).toBeCloseTo(0.5, 6);
    expect(cpToWinProb(300)).toBeGreaterThan(0.7);
    expect(cpToWinProb(500)).toBeGreaterThan(0.8);
    expect(cpToWinProb(-300)).toBeLessThan(0.3);
  });
  it('eval bar: mate clamps to the edge, cp 0 is 50%', () => {
    expect(evalBarWhitePercent(0, null)).toBe(50);
    expect(evalBarWhitePercent(null, 3)).toBe(100);
    expect(evalBarWhitePercent(null, -2)).toBe(0);
    expect(evalBarWhitePercent(500, null)).toBeGreaterThan(80);
  });
  it('eval text', () => {
    expect(evalText(150, null)).toBe('1.50');
    expect(evalText(null, 4)).toBe('#4');
    expect(evalText(null, -2)).toBe('#-2');
    expect(evalText(null, null)).toBe('—');
  });
  it('date keys are zero-padded', () => {
    expect(dateKey(new Date(2026, 10, 17))).toBe('2026-11-17');
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  it('flag emoji from country code', () => {
    expect(flagEmoji('in')).toBe('🇮🇳');
    expect(flagEmoji('')).toBe('');
    expect(flagEmoji(undefined)).toBe('');
  });
});
