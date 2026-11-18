// ChessPulse — puzzle session state machine (pure logic, no DOM).
// A puzzle is a position plus the published solution line (UCI moves).
// The player must play the solver's moves; the opponent replies are scripted
// from the same line. This is honest labelling: ChessPulse replays the
// published line, it does not run an engine to validate arbitrary moves.

import {
  replaySan,
  parsePgnMovetext,
  uciToMove,
  applyMove,
  moveToSan,
  type GameState,
  type Move,
} from './chess';

export interface PuzzleData {
  id: string;
  rating: number;
  plays: number;
  solution: string[]; // UCI
  initialPly: number;
  gamePgn: string;
  gameId: string;
  players: { name: string; color: string; rating: number }[];
  perfName: string;
}

export type TryResult =
  | { kind: 'correct'; san: string; replySan: string | null; solved: boolean }
  | { kind: 'wrong'; san: string }
  | { kind: 'already-solved' }
  | { kind: 'illegal' };

export class PuzzleSession {
  readonly data: PuzzleData;
  /** Position the puzzle starts from (after initialPly of the game). */
  readonly startState: GameState;
  /** Full game states, index = ply (0 = startpos). */
  readonly gameStates: GameState[];
  state: GameState;
  /** Index into solution[] of the next expected solver move. */
  solutionIndex = 0;
  hearts = 5;
  solved = false;
  movesPlayed: string[] = []; // SAN, solver + replies interleaved
  hintStep = 0; // 0 none, 1 piece highlighted, 2 move shown
  startedAt: number | null = null;
  solvedAt: number | null = null;

  constructor(data: PuzzleData) {
    this.data = data;
    const sans = parsePgnMovetext(data.gamePgn);
    this.gameStates = replaySan(sans);
    // Lichess's initialPly is the 0-based index of the last game ply, so the
    // puzzle position is usually after initialPly + 1 half-moves. Verified
    // against the 2026-11-17 daily puzzle (initialPly 67, 68-ply game):
    // states[67] is black to move and the solution's first move (a white
    // move) is illegal there; states[68] is white to move and the line
    // plays. Pick the earliest state where the published line is playable.
    let start = this.gameStates[data.initialPly];
    if (
      start &&
      data.solution.length > 0 &&
      !uciToMove(start, data.solution[0])
    ) {
      const alt = this.gameStates[data.initialPly + 1];
      if (alt && uciToMove(alt, data.solution[0])) start = alt;
    }
    if (!start) throw new Error('Puzzle initialPly beyond game length');
    this.startState = start;
    this.state = start;
  }

  get sideToMove(): 'w' | 'b' {
    return this.state.turn;
  }

  get nextExpectedUci(): string | null {
    return this.data.solution[this.solutionIndex] ?? null;
  }

  get movesRemaining(): number {
    return Math.ceil(
      (this.data.solution.length - this.solutionIndex) / 2,
    );
  }

  startTimer(now = Date.now()): void {
    if (this.startedAt === null) this.startedAt = now;
  }

  elapsedSeconds(now = Date.now()): number {
    if (this.startedAt === null) return 0;
    const end = this.solvedAt ?? now;
    return Math.max(0, Math.round((end - this.startedAt) / 1000));
  }

  tryMove(uci: string): TryResult {
    if (this.solved) return { kind: 'already-solved' };
    this.startTimer();
    const expected = this.nextExpectedUci;
    if (!expected) return { kind: 'illegal' };
    if (uci !== expected) {
      // Is it at least a legal move? (Wrong-but-legal loses a heart; illegal is ignored.)
      const m = uciToMove(this.state, uci);
      if (!m) return { kind: 'illegal' };
      this.hearts = Math.max(0, this.hearts - 1);
      this.hintStep = 0;
      return { kind: 'wrong', san: moveToSan(this.state, m) };
    }
    const move = uciToMove(this.state, uci);
    if (!move) return { kind: 'illegal' };
    const san = moveToSan(this.state, move);
    this.state = applyMove(this.state, move);
    this.movesPlayed.push(san);
    this.solutionIndex++;
    this.hintStep = 0;
    let replySan: string | null = null;
    const replyUci = this.data.solution[this.solutionIndex];
    if (replyUci) {
      const reply = uciToMove(this.state, replyUci);
      if (reply) {
        replySan = moveToSan(this.state, reply);
        this.state = applyMove(this.state, reply);
        this.movesPlayed.push(replySan);
        this.solutionIndex++;
      }
    }
    if (this.solutionIndex >= this.data.solution.length) {
      this.solved = true;
      this.solvedAt = Date.now();
    }
    return { kind: 'correct', san, replySan, solved: this.solved };
  }

  /** Hint step 1: the square of the piece to move. Step 2: the full move. */
  hint(): { step: 1 | 2; from: number; to: number | null } | null {
    const expected = this.nextExpectedUci;
    if (!expected || this.solved) return null;
    const m = uciToMove(this.state, expected);
    if (!m) return null;
    if (this.hintStep === 0) {
      this.hintStep = 1;
      return { step: 1, from: m.from, to: null };
    }
    this.hintStep = 2;
    return { step: 2, from: m.from, to: m.to };
  }

  /** Play the remaining solution on the board, returning the SANs in order. */
  revealSolution(): { moves: Move[]; sans: string[] } {
    const moves: Move[] = [];
    const sans: string[] = [];
    let s = this.state;
    for (let i = this.solutionIndex; i < this.data.solution.length; i++) {
      const m = uciToMove(s, this.data.solution[i]);
      if (!m) break;
      sans.push(moveToSan(s, m));
      moves.push(m);
      s = applyMove(s, m);
    }
    return { moves, sans };
  }

  reset(): void {
    this.state = this.startState;
    this.solutionIndex = 0;
    this.hearts = 5;
    this.solved = false;
    this.movesPlayed = [];
    this.hintStep = 0;
    this.startedAt = null;
    this.solvedAt = null;
  }
}
