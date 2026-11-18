// Fixture tests — the saved Lichess responses are real API payloads
// (fetched 2026-11-17); the app's parsers must handle their exact shape.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

function loadExample(name: string) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'examples', name), 'utf8'),
  );
}

describe('daily puzzle fixture', () => {
  it('has the shape the app consumes', () => {
    const d = loadExample('puzzle-daily-2026-11-17.json');
    expect(d.puzzle.id).toBe('etYYx');
    expect(d.puzzle.rating).toBe(1875);
    expect(d.puzzle.solution).toEqual(['d5f7', 'f8f7', 'd1d8', 'f7f8', 'e7g7', 'g8h8', 'd8f8']);
    expect(d.puzzle.initialPly).toBe(67);
    expect(d.game.pgn.split(/\s+/).length).toBe(68);
    expect(d.game.players).toHaveLength(2);
  });
});

describe('top-10 blitz fixture', () => {
  it('top player has a blitz rating above 2900', () => {
    const d = loadExample('top10-blitz-2026-11-17.json');
    expect(d.users.length).toBe(10);
    expect(d.users[0].perfs.blitz.rating).toBeGreaterThan(2900);
    for (const u of d.users) {
      expect(typeof u.username).toBe('string');
      expect(typeof u.perfs.blitz.rating).toBe('number');
    }
  });
});

describe('tv channels fixture', () => {
  it('lists the expected channels with game ids', () => {
    const d = loadExample('tv-channels-2026-11-17.json');
    for (const key of ['bullet', 'blitz', 'rapid', 'classical']) {
      expect(d[key].gameId).toBeTruthy();
      expect(typeof d[key].gameId).toBe('string');
    }
    expect(d.bullet.rating).toBeGreaterThan(2500);
  });
});
