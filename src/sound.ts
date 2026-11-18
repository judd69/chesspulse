// ChessPulse — tiny Web Audio sounds (no audio files).
// A short click for a move, a lower thock for a capture, a two-note chime
// for a solve, a soft buzz for a wrong move. Off by default until the user
// enables sound; the toggle lives in localStorage.

let ctx: AudioContext | null = null;
let enabled = false;

try {
  enabled = localStorage.getItem('chesspulse.sound') === '1';
} catch {
  enabled = false;
}

export function isSoundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem('chesspulse.sound', on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, durMs: number, type: OscillatorType, gain = 0.08, when = 0): void {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + when;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + durMs / 1000 + 0.02);
}

export function playMove(): void {
  tone(620, 70, 'triangle', 0.07);
}

export function playCapture(): void {
  tone(320, 90, 'triangle', 0.09);
  tone(180, 110, 'sine', 0.07, 0.02);
}

export function playCheck(): void {
  tone(880, 90, 'sine', 0.07);
  tone(880, 90, 'sine', 0.06, 0.12);
}

export function playWrong(): void {
  tone(160, 140, 'sawtooth', 0.04);
}

export function playSolved(): void {
  tone(523, 120, 'sine', 0.08);
  tone(659, 120, 'sine', 0.08, 0.1);
  tone(784, 220, 'sine', 0.08, 0.2);
}
