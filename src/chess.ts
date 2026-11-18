// ChessPulse — chess rules engine.
// Board: 64-element array, index = rank*8 + file, a1 = 0, h8 = 63.
// Pure functions, no DOM, no network. Fully unit-tested (see tests/chess.test.ts).

export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface Piece {
  type: PieceType;
  color: Color;
}

export type Board = (Piece | null)[];

export interface GameState {
  board: Board;
  turn: Color;
  castling: string; // e.g. "KQkq" or "-"
  ep: number; // en-passant target square index, or -1
  halfmove: number;
  fullmove: number;
}

export interface Move {
  from: number;
  to: number;
  piece: PieceType;
  captured: PieceType | null;
  promotion: PieceType | null;
  flags: 'normal' | 'double' | 'ep' | 'castleK' | 'castleQ';
}

export function other(c: Color): Color {
  return c === 'w' ? 'b' : 'w';
}

export function sqName(i: number): string {
  return 'abcdefgh'[i & 7] + String((i >> 3) + 1);
}

export function sqIndex(name: string): number {
  const f = name.charCodeAt(0) - 97;
  const r = name.charCodeAt(1) - 49;
  return r * 8 + f;
}

export function fileOf(i: number): number {
  return i & 7;
}

export function rankOf(i: number): number {
  return i >> 3;
}

export function onBoard(f: number, r: number): boolean {
  return f >= 0 && f < 8 && r >= 0 && r < 8;
}

export function emptyBoard(): Board {
  return new Array<Piece | null>(64).fill(null);
}

export const START_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function parseFen(fen: string): GameState {
  const parts = fen.trim().split(/\s+/);
  const board = emptyBoard();
  const rows = parts[0].split('/');
  if (rows.length !== 8) throw new Error('Invalid FEN: expected 8 ranks');
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of rows[7 - r]) {
      if (/[1-8]/.test(ch)) {
        f += Number(ch);
      } else {
        const color: Color = ch === ch.toUpperCase() ? 'w' : 'b';
        board[r * 8 + f] = { type: ch.toLowerCase() as PieceType, color };
        f++;
      }
    }
    if (f !== 8) throw new Error('Invalid FEN: rank does not sum to 8');
  }
  return {
    board,
    turn: parts[1] === 'b' ? 'b' : 'w',
    castling: parts[2] || '-',
    ep: parts[3] && parts[3] !== '-' ? sqIndex(parts[3]) : -1,
    halfmove: parts[4] ? Number(parts[4]) : 0,
    fullmove: parts[5] ? Number(parts[5]) : 1,
  };
}

export function toFen(s: GameState): string {
  const rows: string[] = [];
  for (let r = 7; r >= 0; r--) {
    let row = '';
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = s.board[r * 8 + f];
      if (!p) {
        empty++;
      } else {
        if (empty) {
          row += String(empty);
          empty = 0;
        }
        row += p.color === 'w' ? p.type.toUpperCase() : p.type;
      }
    }
    if (empty) row += String(empty);
    rows.push(row);
  }
  return [
    rows.join('/'),
    s.turn,
    s.castling === '' ? '-' : s.castling,
    s.ep >= 0 ? sqName(s.ep) : '-',
    s.halfmove,
    s.fullmove,
  ].join(' ');
}

export function countPieces(s: GameState): number {
  let n = 0;
  for (const p of s.board) if (p) n++;
  return n;
}

export function findKing(board: Board, color: Color): number {
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p && p.type === 'k' && p.color === color) return i;
  }
  return -1;
}

function attackedBy(board: Board, sq: number, by: Color): boolean {
  const f = fileOf(sq);
  const r = rankOf(sq);
  // Pawns
  const pr = by === 'w' ? r - 1 : r + 1;
  for (const df of [-1, 1]) {
    const pf = f + df;
    if (onBoard(pf, pr)) {
      const p = board[pr * 8 + pf];
      if (p && p.type === 'p' && p.color === by) return true;
    }
  }
  // Knights
  for (const [df, dr] of [
    [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
  ]) {
    const nf = f + df;
    const nr = r + dr;
    if (onBoard(nf, nr)) {
      const p = board[nr * 8 + nf];
      if (p && p.type === 'n' && p.color === by) return true;
    }
  }
  // King
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue;
      const nf = f + df;
      const nr = r + dr;
      if (onBoard(nf, nr)) {
        const p = board[nr * 8 + nf];
        if (p && p.type === 'k' && p.color === by) return true;
      }
    }
  }
  // Sliders
  const dirs: [number, number, PieceType[]][] = [
    [1, 0, ['r', 'q']],
    [-1, 0, ['r', 'q']],
    [0, 1, ['r', 'q']],
    [0, -1, ['r', 'q']],
    [1, 1, ['b', 'q']],
    [1, -1, ['b', 'q']],
    [-1, 1, ['b', 'q']],
    [-1, -1, ['b', 'q']],
  ];
  for (const [df, dr, types] of dirs) {
    let nf = f + df;
    let nr = r + dr;
    while (onBoard(nf, nr)) {
      const p = board[nr * 8 + nf];
      if (p) {
        if (p.color === by && types.includes(p.type)) return true;
        break;
      }
      nf += df;
      nr += dr;
    }
  }
  return false;
}

export function inCheck(s: GameState, color: Color): boolean {
  const k = findKing(s.board, color);
  if (k < 0) return false;
  return attackedBy(s.board, k, other(color));
}

function pseudoMoves(s: GameState): Move[] {
  const moves: Move[] = [];
  const us = s.turn;
  const dir = us === 'w' ? 1 : -1;
  const startRank = us === 'w' ? 1 : 6;
  const promoRank = us === 'w' ? 7 : 0;

  const add = (
    from: number,
    to: number,
    piece: PieceType,
    captured: PieceType | null,
    flags: Move['flags'] = 'normal',
    promotion: PieceType | null = null,
  ) => {
    moves.push({ from, to, piece, captured, promotion, flags });
  };

  for (let i = 0; i < 64; i++) {
    const p = s.board[i];
    if (!p || p.color !== us) continue;
    const f = fileOf(i);
    const r = rankOf(i);
    if (p.type === 'p') {
      const one = i + dir * 8;
      if (!s.board[one]) {
        if (rankOf(one) === promoRank) {
          for (const pr of ['q', 'r', 'b', 'n'] as PieceType[]) {
            add(i, one, 'p', null, 'normal', pr);
          }
        } else {
          add(i, one, 'p', null);
          if (r === startRank) {
            const two = i + dir * 16;
            if (!s.board[two]) add(i, two, 'p', null, 'double');
          }
        }
      }
      for (const df of [-1, 1]) {
        const nf = f + df;
        const nr = r + dir;
        if (!onBoard(nf, nr)) continue;
        const t = nr * 8 + nf;
        const target = s.board[t];
        if (target && target.color !== us) {
          if (nr === promoRank) {
            for (const pr of ['q', 'r', 'b', 'n'] as PieceType[]) {
              add(i, t, 'p', target.type, 'normal', pr);
            }
          } else {
            add(i, t, 'p', target.type);
          }
        } else if (t === s.ep) {
          add(i, t, 'p', 'p', 'ep');
        }
      }
    } else if (p.type === 'n' || p.type === 'k') {
      const steps =
        p.type === 'n'
          ? [
              [1, 2], [2, 1], [2, -1], [1, -2],
              [-1, -2], [-2, -1], [-2, 1], [-1, 2],
            ]
          : [
              [1, 0], [1, 1], [0, 1], [-1, 1],
              [-1, 0], [-1, -1], [0, -1], [1, -1],
            ];
      for (const [df, dr] of steps) {
        const nf = f + df;
        const nr = r + dr;
        if (!onBoard(nf, nr)) continue;
        const t = nr * 8 + nf;
        const target = s.board[t];
        if (!target) add(i, t, p.type, null);
        else if (target.color !== us) add(i, t, p.type, target.type);
      }
      if (p.type === 'k') {
        // Castling (rights + empty squares; attack checks happen in legal filter)
        const home = us === 'w' ? 4 : 60;
        if (i === home) {
          const rights = s.castling;
          if (us === 'w' && rights.includes('K') && !s.board[5] && !s.board[6] && s.board[7]?.type === 'r' && s.board[7]?.color === 'w') {
            add(4, 6, 'k', null, 'castleK');
          }
          if (us === 'w' && rights.includes('Q') && !s.board[3] && !s.board[2] && !s.board[1] && s.board[0]?.type === 'r' && s.board[0]?.color === 'w') {
            add(4, 2, 'k', null, 'castleQ');
          }
          if (us === 'b' && rights.includes('k') && !s.board[61] && !s.board[62] && s.board[63]?.type === 'r' && s.board[63]?.color === 'b') {
            add(60, 62, 'k', null, 'castleK');
          }
          if (us === 'b' && rights.includes('q') && !s.board[59] && !s.board[58] && !s.board[57] && s.board[56]?.type === 'r' && s.board[56]?.color === 'b') {
            add(60, 58, 'k', null, 'castleQ');
          }
        }
      }
    } else {
      const dirs =
        p.type === 'b'
          ? [[1, 1], [1, -1], [-1, 1], [-1, -1]]
          : p.type === 'r'
            ? [[1, 0], [-1, 0], [0, 1], [0, -1]]
            : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      for (const [df, dr] of dirs) {
        let nf = f + df;
        let nr = r + dr;
        while (onBoard(nf, nr)) {
          const t = nr * 8 + nf;
          const target = s.board[t];
          if (!target) {
            add(i, t, p.type, null);
          } else {
            if (target.color !== us) add(i, t, p.type, target.type);
            break;
          }
          nf += df;
          nr += dr;
        }
      }
    }
  }
  return moves;
}

export function applyMove(s: GameState, m: Move): GameState {
  const board = s.board.slice();
  const piece = board[m.from];
  if (!piece) throw new Error('applyMove: no piece on ' + sqName(m.from));
  board[m.from] = null;
  if (m.flags === 'ep') {
    board[m.to + (piece.color === 'w' ? -8 : 8)] = null;
  }
  if (m.flags === 'castleK') {
    const r = piece.color === 'w' ? 0 : 7;
    board[r * 8 + 7] = null;
    board[r * 8 + 5] = { type: 'r', color: piece.color };
  }
  if (m.flags === 'castleQ') {
    const r = piece.color === 'w' ? 0 : 7;
    board[r * 8 + 0] = null;
    board[r * 8 + 3] = { type: 'r', color: piece.color };
  }
  board[m.to] = m.promotion
    ? { type: m.promotion, color: piece.color }
    : piece;

  let castling = s.castling;
  if (piece.type === 'k') {
    castling = castling.replace(piece.color === 'w' ? /[KQ]/g : /[kq]/g, '');
  }
  if (piece.type === 'r') {
    if (m.from === 0) castling = castling.replace('Q', '');
    if (m.from === 7) castling = castling.replace('K', '');
    if (m.from === 56) castling = castling.replace('q', '');
    if (m.from === 63) castling = castling.replace('k', '');
  }
  if (m.to === 0) castling = castling.replace('Q', '');
  if (m.to === 7) castling = castling.replace('K', '');
  if (m.to === 56) castling = castling.replace('q', '');
  if (m.to === 63) castling = castling.replace('k', '');
  if (castling === '') castling = '-';

  return {
    board,
    turn: other(s.turn),
    castling,
    ep: m.flags === 'double' ? m.from + (piece.color === 'w' ? 8 : -8) : -1,
    halfmove: piece.type === 'p' || m.captured ? 0 : s.halfmove + 1,
    fullmove: s.turn === 'b' ? s.fullmove + 1 : s.fullmove,
  };
}

export function legalMoves(s: GameState): Move[] {
  const out: Move[] = [];
  for (const m of pseudoMoves(s)) {
    // Castling may not pass through check.
    if (m.flags === 'castleK' || m.flags === 'castleQ') {
      const us = s.turn;
      const home = us === 'w' ? 4 : 60;
      const through = m.flags === 'castleK'
        ? [home, home + 1, home + 2]
        : [home, home - 1, home - 2];
      if (through.some((sq) => attackedBy(s.board, sq, other(us)))) continue;
    }
    const next = applyMove(s, m);
    if (!inCheck(next, s.turn)) out.push(m);
  }
  return out;
}

export function moveToSan(s: GameState, m: Move): string {
  if (m.flags === 'castleK') return 'O-O';
  if (m.flags === 'castleQ') return 'O-O-O';
  const pieceLetter: Record<PieceType, string> = {
    p: '', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K',
  };
  let san = pieceLetter[m.piece];
  if (m.piece === 'p') {
    if (m.captured) san += 'abcdefgh'[fileOf(m.from)] + 'x';
    san += sqName(m.to);
    if (m.promotion) san += '=' + m.promotion.toUpperCase();
  } else {
    const others = legalMoves(s).filter(
      (o) =>
        o.piece === m.piece &&
        o.to === m.to &&
        o.from !== m.from &&
        o.promotion === m.promotion,
    );
    if (others.length > 0) {
      const sameFile = others.some((o) => fileOf(o.from) === fileOf(m.from));
      const sameRank = others.some((o) => rankOf(o.from) === rankOf(m.from));
      if (!sameFile) san += 'abcdefgh'[fileOf(m.from)];
      else if (!sameRank) san += String(rankOf(m.from) + 1);
      else san += sqName(m.from);
    }
    if (m.captured) san += 'x';
    san += sqName(m.to);
  }
  const next = applyMove(s, m);
  const oppMoves = legalMoves(next);
  if (inCheck(next, next.turn)) {
    san += oppMoves.length === 0 ? '#' : '+';
  }
  return san;
}

export function parseSan(s: GameState, san: string): Move | null {
  const clean = san.replace(/[+#?!]+$/, '').replace(/[!?]+$/, '');
  for (const m of legalMoves(s)) {
    if (moveToSan(s, m).replace(/[+#]+$/, '') === clean) return m;
  }
  return null;
}

export function uciToMove(s: GameState, uci: string): Move | null {
  const from = sqIndex(uci.slice(0, 2));
  const to = sqIndex(uci.slice(2, 4));
  const promo = uci.length > 4 ? (uci[4] as PieceType) : null;
  for (const m of legalMoves(s)) {
    if (m.from === from && m.to === to && m.promotion === promo) return m;
  }
  return null;
}

export function moveToUci(m: Move): string {
  return sqName(m.from) + sqName(m.to) + (m.promotion ?? '');
}

export function isCheckmate(s: GameState): boolean {
  return inCheck(s, s.turn) && legalMoves(s).length === 0;
}

export function isStalemate(s: GameState): boolean {
  return !inCheck(s, s.turn) && legalMoves(s).length === 0;
}

export function insufficientMaterial(s: GameState): boolean {
  const pieces: Piece[] = [];
  for (const p of s.board) if (p) pieces.push(p);
  if (pieces.length === 2) return true; // K vs K
  if (pieces.length === 3) {
    return pieces.some((p) => p.type === 'b' || p.type === 'n');
  }
  return false;
}

/** Apply a list of SAN moves from the start position; returns states after each ply. */
export function replaySan(moves: string[]): GameState[] {
  const states: GameState[] = [parseFen(START_FEN)];
  let s = states[0];
  for (const san of moves) {
    const m = parseSan(s, san);
    if (!m) throw new Error('replaySan: illegal move ' + san + ' at ply ' + states.length);
    s = applyMove(s, m);
    states.push(s);
  }
  return states;
}

/** Split a PGN movetext into SAN tokens, dropping move numbers, results and comments. */
export function parsePgnMovetext(pgn: string): string[] {
  return pgn
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\$\d+/g, ' ')
    .replace(/\d+\.(\.\.)?/g, ' ')
    .replace(/(1-0|0-1|1\/2-1\/2|\*)/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}
