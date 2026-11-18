// Puzzle session tests — against today's REAL daily puzzle (fixture saved
// at build time: examples/puzzle-daily-2026-11-17.json, puzzle etYYx).

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PuzzleSession, type PuzzleData } from '../src/puzzle';

function loadDailyFixture(): PuzzleData {
  const raw = fs.readFileSync(
    path.join(__dirname, '..', 'examples', 'puzzle-daily-2026-11-17.json'),
    'utf8',
  );
  const d = JSON.parse(raw);
  return {
    id: d.puzzle.id,
    rating: d.puzzle.rating,
    plays: d.puzzle.plays,
    solution: d.puzzle.solution,
    initialPly: d.puzzle.initialPly,
    gamePgn: d.game.pgn,
    gameId: d.game.id,
    players: d.game.players,
    perfName: d.game.perf.name,
  };
}

describe('daily puzzle fixture (etYYx, rated 1875)', () => {
  it('loads at the puzzle position (ply 68 of a 68-move game, white to move)', () => {
    const s = new PuzzleSession(loadDailyFixture());
    expect(s.data.id).toBe('etYYx');
    expect(s.data.rating).toBe(1875);
    expect(s.gameStates.length).toBe(69); // startpos + 68 plies
    expect(s.sideToMove).toBe('w');
    expect(s.movesRemaining).toBe(4);
  });

  it('accepts the first solution move and plays the scripted reply', () => {
    const s = new PuzzleSession(loadDailyFixture());
    const r = s.tryMove('d5f7');
    expect(r.kind).toBe('correct');
    if (r.kind === 'correct') {
      expect(r.san).toBe('Qxf7+');
      expect(r.replySan).toBe('Rxf7');
      expect(r.solved).toBe(false);
    }
    expect(s.movesPlayed).toEqual(['Qxf7+', 'Rxf7']);
  });

  it('solves the whole 7-move line', () => {
    const s = new PuzzleSession(loadDailyFixture());
    const line = ['d5f7', 'd1d8', 'e7g7', 'd8f8'];
    for (const uci of line) {
      const r = s.tryMove(uci);
      expect(r.kind).toBe('correct');
    }
    expect(s.solved).toBe(true);
    expect(s.movesPlayed).toEqual(['Qxf7+', 'Rxf7', 'Rd8+', 'Rf8', 'Rg7+', 'Kh8', 'Rxf8#']);
    expect(s.hearts).toBe(5);
  });

  it('a legal wrong move loses a heart and does not advance the line', () => {
    const s = new PuzzleSession(loadDailyFixture());
    // The queen on d5 can also step to e6 — legal, but not the solution.
    const r = s.tryMove('d5e6');
    expect(r.kind).toBe('wrong');
    expect(s.hearts).toBe(4);
    expect(s.solutionIndex).toBe(0);
    expect(s.movesPlayed).toEqual([]);
  });

  it('an illegal move is ignored and loses no heart', () => {
    const s = new PuzzleSession(loadDailyFixture());
    const r = s.tryMove('e2e4'); // no piece can play e2e4 in this position
    expect(r.kind).toBe('illegal');
    expect(s.hearts).toBe(5);
  });

  it('hint step 1 highlights the queen, step 2 shows Qxf7', () => {
    const s = new PuzzleSession(loadDailyFixture());
    const h1 = s.hint();
    expect(h1?.step).toBe(1);
    expect(h1?.to).toBeNull();
    const h2 = s.hint();
    expect(h2?.step).toBe(2);
    expect(h2?.from).toBe(35); // d5
    expect(h2?.to).toBe(53); // f7
  });

  it('revealSolution returns the full remaining line', () => {
    const s = new PuzzleSession(loadDailyFixture());
    s.tryMove('d5f7');
    const { sans } = s.revealSolution();
    expect(sans).toEqual(['Rd8+', 'Rf8', 'Rg7+', 'Kh8', 'Rxf8#']);
  });

  it('reset restores the starting position and hearts', () => {
    const s = new PuzzleSession(loadDailyFixture());
    s.tryMove('d5e6');
    s.reset();
    expect(s.hearts).toBe(5);
    expect(s.solutionIndex).toBe(0);
    expect(s.movesPlayed).toEqual([]);
    expect(s.solved).toBe(false);
  });
});
