// Chess engine tests — perft counts are the ground truth for move generation.

import { describe, it, expect } from 'vitest';
import {
  parseFen,
  toFen,
  legalMoves,
  applyMove,
  uciToMove,
  parseSan,
  moveToSan,
  isCheckmate,
  isStalemate,
  insufficientMaterial,
  inCheck,
  replaySan,
  parsePgnMovetext,
  START_FEN,
} from '../src/chess';

function perft(fen: string, depth: number): number {
  const s = parseFen(fen);
  if (depth === 0) return 1;
  let nodes = 0;
  for (const m of legalMoves(s)) {
    nodes += perftState(applyMove(s, m), depth - 1);
  }
  return nodes;
}

function perftState(s: ReturnType<typeof parseFen>, depth: number): number {
  if (depth === 0) return 1;
  let nodes = 0;
  for (const m of legalMoves(s)) {
    nodes += perftState(applyMove(s, m), depth - 1);
  }
  return nodes;
}

describe('FEN', () => {
  it('round-trips the start position', () => {
    expect(toFen(parseFen(START_FEN))).toBe(START_FEN);
  });
  it('round-trips a middlegame FEN', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 2 3';
    expect(toFen(parseFen(fen))).toBe(fen);
  });
  it('rejects a bad FEN', () => {
    expect(() => parseFen('8/8/8/8/8/8/8 w - - 0 1')).toThrow(); // only 7 ranks
  });
});

describe('perft (move generation)', () => {
  it('startpos depth 1 = 20', () => {
    expect(perft(START_FEN, 1)).toBe(20);
  });
  it('startpos depth 2 = 400', () => {
    expect(perft(START_FEN, 2)).toBe(400);
  });
  it('startpos depth 3 = 8902', () => {
    expect(perft(START_FEN, 3)).toBe(8902);
  });
  it('Kiwipete depth 1 = 48, depth 2 = 2039', () => {
    const kiwipete = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
    expect(perft(kiwipete, 1)).toBe(48);
    expect(perft(kiwipete, 2)).toBe(2039);
  });
  it('position 3 (en passant / pins) depth 2 = 978', () => {
    const pos3 = '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1';
    expect(perft(pos3, 1)).toBe(14);
    expect(perft(pos3, 2)).toBe(191);
  });
});

describe('check, mate and stalemate', () => {
  it("Fool's mate is checkmate", () => {
    const states = replaySan(['f3', 'e5', 'g4', 'Qh4#']);
    const final = states[states.length - 1];
    expect(isCheckmate(final)).toBe(true);
    expect(legalMoves(final).length).toBe(0);
  });
  it('detects check', () => {
    const states = replaySan(['e4', 'e5', 'Qh5']);
    expect(inCheck(states[states.length - 1], 'b')).toBe(false); // Qh5 does not check yet
    const s2 = replaySan(['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#']);
    expect(isCheckmate(s2[s2.length - 1])).toBe(true);
  });
  it('stalemate is detected', () => {
    const s = parseFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(isStalemate(s)).toBe(true);
    expect(isCheckmate(s)).toBe(false);
  });
  it('K vs K is insufficient material', () => {
    const s = parseFen('8/8/4k3/8/8/3K4/8/8 w - - 0 1');
    expect(insufficientMaterial(s)).toBe(true);
  });
});

describe('SAN', () => {
  it('parses and generates SAN for the opening', () => {
    const s = parseFen(START_FEN);
    const m = parseSan(s, 'e4');
    expect(m).not.toBeNull();
    expect(moveToSan(s, m!)).toBe('e4');
    const s2 = applyMove(s, m!);
    expect(moveToSan(s2, parseSan(s2, 'Nf6')!)).toBe('Nf6');
  });
  it('disambiguates knights', () => {
    const s = parseFen('7k/8/8/8/8/8/1N3N2/7K w - - 0 1');
    const m = parseSan(s, 'Nbd3');
    expect(m).not.toBeNull();
    expect(moveToSan(s, m!)).toBe('Nbd3');
  });
  it('handles castling SAN', () => {
    const s = parseFen('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
    expect(parseSan(s, 'O-O')).not.toBeNull();
    expect(parseSan(s, 'O-O-O')).not.toBeNull();
  });
  it('handles en passant', () => {
    const states = replaySan(['e4', 'a6', 'e5', 'd5']);
    const s = states[states.length - 1];
    const m = parseSan(s, 'exd6');
    expect(m).not.toBeNull();
    expect(m!.flags).toBe('ep');
  });
  it('handles promotion', () => {
    const s = parseFen('8/P7/8/8/8/8/k6K/8 w - - 0 1');
    const m = uciToMove(s, 'a7a8q');
    expect(m).not.toBeNull();
    expect(moveToSan(s, m!)).toBe('a8=Q+'); // the new queen checks down the a-file
  });
  it('marks check and mate', () => {
    const states = replaySan(['f3', 'e5', 'g4']);
    const s = states[states.length - 1];
    expect(moveToSan(s, parseSan(s, 'Qh4#')!)).toBe('Qh4#');
  });
});

describe('PGN', () => {
  it('splits movetext and replays the Ruy Lopez opening', () => {
    const sans = parsePgnMovetext('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0');
    expect(sans).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
    const states = replaySan(sans);
    expect(states.length).toBe(7);
  });
  it('drops comments and NAGs', () => {
    const sans = parsePgnMovetext('1. e4 {best by test} e5 $1 2. Nf3 *');
    expect(sans).toEqual(['e4', 'e5', 'Nf3']);
  });
});
