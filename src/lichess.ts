// ChessPulse — Lichess API client (keyless, browser-safe).
// Every endpoint here was verified live 2026-11-11 and re-verified 2026-11-17:
// HTTP 200 + Access-Control-Allow-Origin: * from this sandbox.
// Endpoints that need OAuth (puzzle activity/dashboard, Storm live play, Racer)
// are deliberately NOT used — see README "What ChessPulse can't do".

const BASE = 'https://lichess.org';

export class LichessError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function getJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch {
    throw new LichessError(0, 'Could not reach lichess.org — check your connection.');
  }
  if (!res.ok) {
    if (res.status === 404) throw new LichessError(404, 'Not found on Lichess.');
    throw new LichessError(res.status, `Lichess returned HTTP ${res.status}.`);
  }
  return (await res.json()) as T;
}

export interface PuzzlePlayer {
  name: string;
  id?: string;
  color: string;
  rating: number;
}

export interface DailyPuzzle {
  game: {
    id: string;
    perf: { key: string; name: string };
    rated: boolean;
    players: PuzzlePlayer[];
    pgn: string;
    clock?: string;
  };
  puzzle: {
    id: string;
    rating: number;
    plays: number;
    solution: string[]; // UCI moves
    themes: string[];
    initialPly: number;
  };
}

export interface PuzzleBatchItem {
  game: { id: string; pgn: string };
  puzzle: {
    id: string;
    rating: number;
    plays: number;
    solution: string[];
    themes: string[];
    initialPly: number;
  };
}

export async function fetchDailyPuzzle(): Promise<DailyPuzzle> {
  return getJson<DailyPuzzle>(`${BASE}/api/puzzle/daily`);
}

export async function fetchPuzzleById(id: string): Promise<DailyPuzzle> {
  return getJson<DailyPuzzle>(`${BASE}/api/puzzle/${encodeURIComponent(id)}`);
}

export async function fetchPuzzleBatch(
  angle: string,
  nb: number,
  difficulty?: string,
): Promise<PuzzleBatchItem[]> {
  const q = new URLSearchParams({ nb: String(nb) });
  if (difficulty) q.set('difficulty', difficulty);
  const data = await getJson<{ puzzles: PuzzleBatchItem[] }>(
    `${BASE}/api/puzzle/batch/${encodeURIComponent(angle)}?${q}`,
  );
  return data.puzzles;
}

export async function fetchPuzzleNext(
  angle?: string,
  difficulty?: string,
): Promise<PuzzleBatchItem> {
  const q = new URLSearchParams();
  if (angle) q.set('angle', angle);
  if (difficulty) q.set('difficulty', difficulty);
  const s = q.toString();
  return getJson<PuzzleBatchItem>(`${BASE}/api/puzzle/next${s ? '?' + s : ''}`);
}

export interface TopPlayer {
  id: string;
  username: string;
  title?: string;
  perfs: Record<string, { rating: number; progress: number }>;
}

export async function fetchTopPlayers(perf: string, nb = 10): Promise<TopPlayer[]> {
  const data = await getJson<{ users: TopPlayer[] }>(
    `${BASE}/api/player/top/${nb}/${encodeURIComponent(perf)}`,
  );
  return data.users;
}

export interface TvChannel {
  user?: { name: string; title?: string; id: string };
  rating?: number;
  gameId: string;
  color: string;
}

export async function fetchTvChannels(): Promise<Record<string, TvChannel>> {
  return getJson<Record<string, TvChannel>>(`${BASE}/api/tv/channels`);
}

export interface TvFeatured {
  id: string;
  orientation: string;
  players: { name?: string; user?: { name: string; title?: string; id: string }; rating?: number; title?: string }[];
  fen: string;
  clock?: { white: number; black: number };
}

export async function fetchTvFeatured(): Promise<TvFeatured> {
  // NDJSON stream: read until the first featured event, then cancel.
  const res = await fetch(`${BASE}/api/tv/feed`);
  if (!res.ok || !res.body) {
    throw new LichessError(res.status, 'Lichess TV feed unavailable.');
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const ev = JSON.parse(line) as { t: string; d: TvFeatured };
        if (ev.t === 'featured') return ev.d;
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
  }
  throw new LichessError(0, 'No featured game on Lichess TV right now.');
}

export interface CloudEvalPv {
  moves: string; // space-separated UCI
  cp?: number;
  mate?: number;
}

export interface CloudEval {
  fen: string;
  depth: number;
  knodes: number;
  pvs: CloudEvalPv[];
}

/** Returns null on a 404 cache miss (position not in Lichess's cloud cache). */
export async function fetchCloudEval(
  fen: string,
  multiPv = 3,
): Promise<CloudEval | null> {
  const url = `${BASE}/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=${multiPv}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch {
    throw new LichessError(0, 'Could not reach lichess.org — check your connection.');
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new LichessError(res.status, `Lichess returned HTTP ${res.status}.`);
  return (await res.json()) as CloudEval;
}

export interface LichessUser {
  id: string;
  username: string;
  title?: string;
  online?: boolean;
  disabled?: boolean;
  tosViolation?: boolean;
  createdAt?: number;
  seenAt?: number;
  perfs?: Record<string, { rating: number; games: number; prog?: number }>;
  count?: { all: number; rated: number; win: number; loss: number; draw: number };
  profile?: { country?: string; bio?: string };
}

export async function fetchUser(username: string): Promise<LichessUser> {
  return getJson<LichessUser>(`${BASE}/api/user/${encodeURIComponent(username)}`);
}

export interface RatingPoint {
  name: string;
  points: [number, number, number, number][];
}

export async function fetchRatingHistory(username: string): Promise<RatingPoint[]> {
  return getJson<RatingPoint[]>(
    `${BASE}/api/user/${encodeURIComponent(username)}/rating-history`,
  );
}

export interface StormDashboard {
  high?: { day: number; week: number; month: number; allTime: number };
  days?: { score: number; moves: number; errors: number; combo: number; time: number; highest: number; day: string }[];
}

export async function fetchStormDashboard(username: string): Promise<StormDashboard | null> {
  const url = `${BASE}/api/storm/dashboard/${encodeURIComponent(username)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch {
    throw new LichessError(0, 'Could not reach lichess.org — check your connection.');
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new LichessError(res.status, `Lichess returned HTTP ${res.status}.`);
  return (await res.json()) as StormDashboard;
}

export interface Tournament {
  id: string;
  fullName: string;
  variant?: { key: string; name: string };
  clock?: { limit: number; increment: number };
  minutes?: number;
  nbPlayers?: number;
  startsAt?: number;
  finishesAt?: number;
  status?: number;
}

export async function fetchTournaments(): Promise<{
  created: Tournament[];
  started: Tournament[];
  finished: Tournament[];
}> {
  return getJson(`${BASE}/api/tournament`);
}

export interface BroadcastTour {
  id: string;
  name: string;
  slug: string;
  description?: string;
  timeControl?: string;
}

export async function fetchBroadcastTop(): Promise<{ tours: BroadcastTour[] }> {
  return getJson(`${BASE}/api/broadcast/top`);
}

export interface TablebaseResult {
  category: string;
  dtz?: number | null;
  dtm?: number | null;
  insufficient_material?: boolean;
  moves?: { uci: string; san: string; dtz: number | null; dtm: number | null; category: string }[];
}

/** Returns null on 404 (position not in the tablebase / too many pieces). */
export async function fetchTablebase(fen: string): Promise<TablebaseResult | null> {
  const url = `https://tablebase.lichess.ovh/standard?fen=${encodeURIComponent(fen)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch {
    return null;
  }
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return (await res.json()) as TablebaseResult;
}

/** Export a game's PGN (public games). Returns null if unavailable. */
export async function fetchGamePgn(gameId: string): Promise<string | null> {
  const url = `${BASE}/game/export/${encodeURIComponent(gameId)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/x-chess-pgn' } });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  return await res.text();
}

/** The documented puzzle angles (Lichess OpenAPI). Labels are ours; angles are exact. */
export const PUZZLE_ANGLES: { angle: string; label: string }[] = [
  { angle: 'mix', label: 'Mixed bag' },
  { angle: 'mate', label: 'Mate' },
  { angle: 'mateIn1', label: 'Mate in 1' },
  { angle: 'mateIn2', label: 'Mate in 2' },
  { angle: 'mateIn3', label: 'Mate in 3' },
  { angle: 'fork', label: 'Fork' },
  { angle: 'pin', label: 'Pin' },
  { angle: 'skewer', label: 'Skewer' },
  { angle: 'sacrifice', label: 'Sacrifice' },
  { angle: 'deflection', label: 'Deflection' },
  { angle: 'discoveredAttack', label: 'Discovered attack' },
  { angle: 'doubleCheck', label: 'Double check' },
  { angle: 'quietMove', label: 'Quiet move' },
  { angle: 'hangingPiece', label: 'Hanging piece' },
  { angle: 'trappedPiece', label: 'Trapped piece' },
  { angle: 'backRankMate', label: 'Back-rank mate' },
  { angle: 'smotheredMate', label: 'Smothered mate' },
  { angle: 'zugzwang', label: 'Zugzwang' },
  { angle: 'interference', label: 'Interference' },
  { angle: 'attraction', label: 'Attraction' },
  { angle: 'clearance', label: 'Clearance' },
  { angle: 'enPassant', label: 'En passant' },
  { angle: 'castling', label: 'Castling' },
  { angle: 'promotion', label: 'Promotion' },
  { angle: 'underpromotion', label: 'Underpromotion' },
  { angle: 'advancedPawn', label: 'Advanced pawn' },
  { angle: 'defensiveMove', label: 'Defensive move' },
  { angle: 'exposedKing', label: 'Exposed king' },
  { angle: 'oneMove', label: 'One move' },
];

export const DIFFICULTIES = ['easiest', 'easier', 'normal', 'harder', 'hardest'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
