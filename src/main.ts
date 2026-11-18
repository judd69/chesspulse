// ChessPulse — app wiring.
// One daily Lichess puzzle on a real board, Puzzle Rush, train by theme,
// engine hints + eval bar, live TV games, leaderboards, player lookup,
// archive + streak calendar, tournaments, shareable result card.

import './style.css';
import {
  parseFen,
  applyMove,
  legalMoves,
  uciToMove,
  parsePgnMovetext,
  replaySan,
  sqName,
  toFen,
  countPieces,
  type GameState,
} from './chess';
import {
  fetchDailyPuzzle,
  fetchPuzzleById,
  fetchPuzzleBatch,
  fetchTopPlayers,
  fetchTvChannels,
  fetchTvFeatured,
  fetchCloudEval,
  fetchUser,
  fetchRatingHistory,
  fetchStormDashboard,
  fetchTournaments,
  fetchBroadcastTop,
  fetchTablebase,
  fetchGamePgn,
  PUZZLE_ANGLES,
  LichessError,
  type DailyPuzzle,
  type PuzzleBatchItem,
  type TvChannel,
} from './lichess';
import { PuzzleSession, type PuzzleData } from './puzzle';
import { BoardView } from './board';
import { pieceSvg } from './pieces';
import {
  loadStats,
  saveStats,
  loadArchive,
  upsertArchiveRecord,
  currentStreak,
  averageSolveSeconds,
  lastNDays,
  type DayRecord,
} from './storage';
import { lookupOpening } from './eco';
import {
  formatClock,
  formatDateLong,
  formatDateShort,
  dateKey,
  evalBarWhitePercent,
  evalText,
  flagEmoji,
} from './format';
import {
  playMove,
  playCapture,
  playWrong,
  playSolved,
  isSoundEnabled,
  setSoundEnabled,
} from './sound';

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const HEART_FULL =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.9-9.7-9.2C.7 8.6 2.6 5 6 5c2 0 3.2 1.1 4 2.3h4C14.8 6.1 16 5 18 5c3.4 0 5.3 3.6 3.7 6.8C19.5 16.1 12 21 12 21z" fill="#16A34A"/></svg>';
const HEART_EMPTY =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.9-9.7-9.2C.7 8.6 2.6 5 6 5c2 0 3.2 1.1 4 2.3h4C14.8 6.1 16 5 18 5c3.4 0 5.3 3.6 3.7 6.8C19.5 16.1 12 21 12 21z" fill="none" stroke="#6B6B66" stroke-width="1.5"/></svg>';

function showToast(el: HTMLElement, msg: string, ms = 2500): void {
  el.textContent = msg;
  el.classList.add('show');
  window.setTimeout(() => el.classList.remove('show'), ms);
}

/** Static mini board from a FEN (TV channels, featured game). */
function miniBoardHtml(fen: string): string {
  try {
    const s = parseFen(fen);
    let html = '<div class="mini-board" aria-hidden="true">';
    for (let r = 7; r >= 0; r--) {
      for (let f = 0; f < 8; f++) {
        const p = s.board[r * 8 + f];
        html += `<div class="msq ${((r + f) % 2 === 0 ? 'dark' : 'light')}"><span>${p ? pieceSvg(p.type, p.color) : ''}</span></div>`;
      }
    }
    return html + '</div>';
  } catch {
    return '<div class="mini-board"></div>';
  }
}

function puzzleDataFromDaily(d: DailyPuzzle): PuzzleData {
  return {
    id: d.puzzle.id,
    rating: d.puzzle.rating,
    plays: d.puzzle.plays,
    solution: d.puzzle.solution,
    initialPly: d.puzzle.initialPly,
    gamePgn: d.game.pgn,
    gameId: d.game.id,
    players: d.game.players.map((p) => ({ name: p.name, color: p.color, rating: p.rating })),
    perfName: d.game.perf.name,
  };
}

function puzzleDataFromBatch(b: PuzzleBatchItem): PuzzleData {
  return {
    id: b.puzzle.id,
    rating: b.puzzle.rating,
    plays: b.puzzle.plays,
    solution: b.puzzle.solution,
    initialPly: b.puzzle.initialPly,
    gamePgn: b.game.pgn,
    gameId: b.game.id,
    players: [],
    perfName: '',
  };
}

// ---------------------------------------------------------------------------
// Daily puzzle (hero)
// ---------------------------------------------------------------------------

let session: PuzzleSession | null = null;
let heroBoard: BoardView | null = null;
let heroLastMove: [number, number] | null = null;
let replayTimer: number | null = null;
let replaying = false;
let evalCache = new Map<string, { cp: number | null; mate: number | null } | null>();
let timerInterval: number | null = null;

function renderHearts(): void {
  const el = $('hearts');
  if (!session) {
    el.innerHTML = '';
    return;
  }
  let html = '';
  for (let i = 0; i < 5; i++) {
    html += `<span class="${i < session.hearts ? '' : 'heart-lost'}" aria-hidden="true">${i < session.hearts ? HEART_FULL : HEART_EMPTY}</span>`;
  }
  el.innerHTML = html;
  el.setAttribute('aria-label', `${session.hearts} of 5 hearts left`);
}

function renderMoveList(): void {
  const el = $('move-list');
  if (!session) {
    el.innerHTML = '<li class="empty">No puzzle loaded.</li>';
    return;
  }
  if (session.movesPlayed.length === 0) {
    el.innerHTML = '<li class="empty">Your moves will appear here.</li>';
    return;
  }
  let html = '';
  for (let i = 0; i < session.movesPlayed.length; i += 2) {
    const ply = Math.floor(i / 2) + 1;
    const san1 = session.movesPlayed[i];
    const san2 = session.movesPlayed[i + 1];
    html += `<li><span class="ply">${ply}.</span><span class="san-current">${san1}</span>${san2 ? `<span class="san-reply">${san2}</span>` : ''}</li>`;
  }
  el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
}

function renderStatsLine(): void {
  const stats = loadStats();
  const avg = averageSolveSeconds(stats);
  $('stats-line').textContent =
    `Solved ${stats.solved} · Best streak ${stats.bestStreak} · Avg ${avg === null ? '—' : formatClock(avg)}`;
  updateStreakChip();
}

function updateStreakChip(): void {
  const records = loadArchive();
  const streak = currentStreak(records, dateKey(new Date()));
  $('streak-count').textContent = String(streak);
}

function updateSideToMove(): void {
  if (!session) return;
  $('side-to-move').textContent = session.solved
    ? 'Solved!'
    : session.sideToMove === 'w'
      ? 'White to move'
      : 'Black to move';
}

async function refreshEval(state: GameState): Promise<void> {
  const fen = toFen(state);
  const cached = evalCache.get(fen);
  const setBar = (cp: number | null, mate: number | null): void => {
    $('eval-white').style.height = `${evalBarWhitePercent(cp, mate)}%`;
    $('eval-label').textContent = evalText(cp, mate);
  };
  if (cached !== undefined) {
    if (cached === null) {
      $('eval-label').textContent = '—';
    } else {
      setBar(cached.cp, cached.mate);
    }
    return;
  }
  try {
    const ev = await fetchCloudEval(fen, 3);
    if (ev === null) {
      evalCache.set(fen, null);
      $('engine-body').innerHTML =
        'No engine eval cached for this position — try the solution instead.';
      $('eval-label').textContent = '—';
      return;
    }
    const pv0 = ev.pvs[0];
    evalCache.set(fen, { cp: pv0?.cp ?? null, mate: pv0?.mate ?? null });
    setBar(pv0?.cp ?? null, pv0?.mate ?? null);
    const pvs = ev.pvs
      .map((pv, i) => {
        const moves = pv.moves.split(' ').slice(0, 4).join(' ');
        return `<div class="pv"><b>${i + 1}.</b> ${evalText(pv.cp ?? null, pv.mate ?? null)} &nbsp;${moves}</div>`;
      })
      .join('');
    $('engine-body').innerHTML =
      `<div>Depth ${ev.depth} · best lines:</div>${pvs}<div style="color:var(--muted);margin-top:4px">From the Lichess cloud-eval cache — no engine runs in your browser.</div>`;
  } catch {
    $('engine-body').textContent = 'Engine eval unavailable right now.';
  }
}

async function refreshTablebase(state: GameState): Promise<void> {
  const el = $('tablebase-line');
  if (countPieces(state) > 7) {
    el.textContent = '';
    return;
  }
  try {
    const tb = await fetchTablebase(toFen(state));
    if (!tb) {
      el.textContent = '';
      return;
    }
    const verdict =
      tb.category === 'win'
        ? `Tablebase: ${state.turn === 'w' ? 'White' : 'Black'} wins${tb.dtm ? ` in ${tb.dtm}` : ''}`
        : tb.category === 'loss'
          ? `Tablebase: ${state.turn === 'w' ? 'White' : 'Black'} loses${tb.dtm ? ` in ${tb.dtm}` : ''}`
          : tb.insufficient_material
            ? 'Tablebase: draw — insufficient material'
            : 'Tablebase: draw';
    el.textContent = verdict;
  } catch {
    el.textContent = '';
  }
}

function onSolved(): void {
  if (!session) return;
  playSolved();
  $('board').classList.add('solved');
  updateSideToMove();
  const secs = session.elapsedSeconds();
  const stats = loadStats();
  stats.solved += 1;
  stats.totalSeconds += secs;
  const records = loadArchive();
  const streak = currentStreak(records, dateKey(new Date())) + 1;
  stats.bestStreak = Math.max(stats.bestStreak, streak);
  stats.lastSolvedDate = dateKey(new Date());
  saveStats(stats);
  upsertArchiveRecord({
    date: dateKey(new Date()),
    puzzleId: session.data.id,
    rating: session.data.rating,
    solved: true,
    seconds: secs,
    heartsLeft: session.hearts,
  });
  $('solved-detail').textContent =
    `Rated ${session.data.rating} · solved in ${formatClock(secs)} · ${session.hearts} of 5 hearts left · streak ${streak}`;
  $('solved-box').hidden = false;
  renderStatsLine();
  renderArchive();
  renderStreakCal();
}

function loadPuzzleIntoHero(data: PuzzleData): void {
  stopReplay();
  session = new PuzzleSession(data);
  heroLastMove = null;
  evalCache = new Map();
  $('board').classList.remove('solved');
  $('solved-box').hidden = true;
  $('puzzle-rating').textContent = `Rated ${data.rating}`;
  const white = data.players.find((p) => p.color === 'white');
  const black = data.players.find((p) => p.color === 'black');
  $('game-line').innerHTML = white && black
    ? `From <strong>${white.name} ${white.rating}</strong> vs <strong>${black.name} ${black.rating}</strong> · ${data.perfName} · ${data.plays.toLocaleString('en-IN')} plays`
    : `Puzzle ${data.id} · ${data.plays.toLocaleString('en-IN')} plays`;
  const sans = parsePgnMovetext(data.gamePgn);
  const opening = lookupOpening(sans);
  $('opening-line').textContent = opening
    ? `${opening.name} (${opening.eco}) — opening name from a reference table of common openings`
    : '';
  $('replay-pos').textContent = '';
  heroBoard?.setOrientation(session.sideToMove);
  heroBoard?.setState(session.state, null);
  heroBoard?.clearHint();
  heroBoard?.setInteractive(true);
  renderHearts();
  renderMoveList();
  updateSideToMove();
  $('puzzle-timer').textContent = '0:00';
  if (timerInterval) window.clearInterval(timerInterval);
  timerInterval = window.setInterval(() => {
    if (session && !session.solved) {
      $('puzzle-timer').textContent = formatClock(session.elapsedSeconds());
    }
  }, 500);
  void refreshEval(session.state);
  void refreshTablebase(session.state);
  // Record the visit in the archive (unsolved until solved).
  const today = dateKey(new Date());
  const existing = loadArchive().find((r) => r.date === today);
  if (!existing || existing.puzzleId !== data.id) {
    upsertArchiveRecord({
      date: today,
      puzzleId: data.id,
      rating: data.rating,
      solved: false,
      seconds: null,
      heartsLeft: null,
    });
  }
  renderArchive();
}

async function loadDailyPuzzle(): Promise<void> {
  $('game-line').textContent = 'Loading today’s puzzle from Lichess…';
  try {
    const d = await fetchDailyPuzzle();
    loadPuzzleIntoHero(puzzleDataFromDaily(d));
  } catch (err) {
    const msg = err instanceof LichessError ? err.message : 'Could not reach lichess.org.';
    $('game-line').innerHTML =
      `Today's puzzle couldn't load — ${msg} <button class="btn btn-quiet" id="retry-daily" type="button">Retry</button> ` +
      `<button class="btn btn-quiet" id="fallback-train" type="button">Play a training puzzle instead</button>`;
    $('retry-daily')?.addEventListener('click', () => void loadDailyPuzzle());
    $('fallback-train')?.addEventListener('click', () => {
      document.getElementById('train')?.scrollIntoView({ behavior: 'smooth' });
      void startTrainingPuzzle();
    });
  }
}

// --- replay the full game behind the puzzle ---
function stopReplay(): void {
  if (replayTimer) window.clearInterval(replayTimer);
  replayTimer = null;
  replaying = false;
  $('replay-game').hidden = false;
  $('replay-back').hidden = true;
  $('replay-pos').textContent = '';
}

function startReplay(): void {
  if (!session || replaying) return;
  replaying = true;
  heroBoard?.setInteractive(false);
  $('replay-game').hidden = true;
  $('replay-back').hidden = false;
  const states = session.gameStates;
  let ply = 0;
  heroBoard?.setState(states[0], null);
  $('replay-pos').textContent = 'Start of game';
  replayTimer = window.setInterval(() => {
    ply++;
    if (ply >= states.length) {
      stopReplay();
      heroBoard?.setInteractive(true);
      heroBoard?.setState(session!.state, heroLastMove);
      $('replay-pos').textContent = 'Puzzle position';
      return;
    }
    const prev = states[ply - 1];
    const cur = states[ply];
    const moved = findMovedSquare(prev, cur);
    heroBoard?.setState(cur, moved);
    $('replay-pos').textContent = `Move ${Math.ceil(ply / 2)}${ply % 2 === 1 ? ' — White' : ' — Black'}`;
  }, 700);
}

function findMovedSquare(a: GameState, b: GameState): [number, number] | null {
  let from = -1;
  let to = -1;
  for (let i = 0; i < 64; i++) {
    const pa = a.board[i];
    const pb = b.board[i];
    if (pa && !pb) from = i;
    if (!pa && pb) to = i;
    if (pa && pb && (pa.type !== pb.type || pa.color !== pb.color)) {
      if (to === -1) to = i;
    }
  }
  // Castling moves the rook too; the king's squares are enough for the highlight.
  if (from >= 0 && to >= 0) return [from, to];
  return null;
}

// --- hero board callbacks ---
function heroLegalTargets(from: number): number[] {
  if (!session || replaying) return [];
  return legalMoves(session.state)
    .filter((m) => m.from === from)
    .map((m) => m.to);
}

function heroOnMove(from: number, to: number, promotion: string | null): boolean {
  if (!session || replaying) return false;
  const expected = session.nextExpectedUci;
  if (!expected) return false;
  const uci = sqName(from) + sqName(to) + (promotion ?? '');
  const move = uciToMove(session.state, uci);
  if (!move) return false; // illegal — ignore silently
  const prevState = session.state;
  const result = session.tryMove(uci);
  if (result.kind === 'wrong') {
    playWrong();
    heroBoard?.setState(session.state, null);
    const el = document.querySelector('.cp-board') as HTMLElement | null;
    el?.classList.remove('shake');
    void el?.offsetWidth; // restart animation
    el?.classList.add('shake');
    showToast($('board-toast'), 'Not that one — try again.');
    renderHearts();
    return true;
  }
  if (result.kind === 'correct') {
    if (move.captured) playCapture();
    else playMove();
    // Show the solver's move first, then the scripted reply 350ms later.
    const intermediate = applyMove(prevState, move);
    heroBoard?.setState(intermediate, [from, to]);
    heroLastMove = [from, to];
    renderMoveList();
    if (result.replySan) {
      window.setTimeout(() => {
        if (!session) return;
        const replyUci = session.data.solution[session.solutionIndex - 1];
        const replyMove = replyUci ? uciToMove(intermediate, replyUci) : null;
        heroLastMove = replyMove ? [replyMove.from, replyMove.to] : heroLastMove;
        heroBoard?.setState(session.state, heroLastMove);
        renderMoveList();
        if (session.solved) onSolved();
        else {
          void refreshEval(session.state);
          void refreshTablebase(session.state);
        }
      }, 350);
    } else {
      renderMoveList();
      if (session.solved) onSolved();
      else {
        void refreshEval(session.state);
        void refreshTablebase(session.state);
      }
    }
    return true;
  }
  return false;
}

function heroHint(): void {
  if (!session) return;
  const h = session.hint();
  if (!h) return;
  if (h.step === 1) {
    heroBoard?.showHint(h.from, null);
    $('hint-btn').textContent = 'Show move';
    showToast($('board-toast'), 'The piece to move is highlighted.');
  } else {
    heroBoard?.showHint(h.from, h.to);
    $('hint-btn').textContent = 'Hint';
  }
}

function heroSolution(): void {
  if (!session) return;
  heroBoard?.setInteractive(false);
  const { moves, sans } = session.revealSolution();
  let i = 0;
  let s = session.state;
  const step = (): void => {
    if (i >= moves.length) {
      heroBoard?.setInteractive(true);
      showToast($('board-toast'), 'That was the full solution.');
      return;
    }
    const m = moves[i];
    const san = sans[i];
    s = applyMove(s, m);
    session!.state = s;
    session!.solutionIndex++;
    session!.movesPlayed.push(san);
    heroBoard?.setState(s, [m.from, m.to]);
    renderMoveList();
    if (session!.solutionIndex >= session!.data.solution.length) {
      session!.solved = true;
      session!.solvedAt = Date.now();
      onSolved();
    }
    i++;
    window.setTimeout(step, 500);
  };
  step();
}

// ---------------------------------------------------------------------------
// Trainer board (Rush + Train by theme)
// ---------------------------------------------------------------------------

let trainerBoard: BoardView | null = null;
let trainerSession: PuzzleSession | null = null;
let trainerQueue: PuzzleBatchItem[] = [];
let trainerMode: 'idle' | 'rush' | 'train' = 'idle';
let trainerAngle = 'mix';
let trainerDifficulty = 'normal';
let rushTimer: number | null = null;
let rushSecondsLeft = 180;
let rushScore = 0;
let rushCombo = 0;
let rushErrors = 0;

function trainerLegalTargets(from: number): number[] {
  if (!trainerSession) return [];
  return legalMoves(trainerSession.state)
    .filter((m) => m.from === from)
    .map((m) => m.to);
}

function trainerOnMove(from: number, to: number, promotion: string | null): boolean {
  if (!trainerSession) return false;
  const uci = sqName(from) + sqName(to) + (promotion ?? '');
  const move = uciToMove(trainerSession.state, uci);
  if (!move) return false;
  const prevState = trainerSession.state;
  const result = trainerSession.tryMove(uci);
  if (result.kind === 'wrong') {
    playWrong();
    if (trainerMode === 'rush') {
      rushCombo = 0;
      rushErrors++;
      updateRushStatus();
    }
    trainerBoard?.setState(trainerSession.state, null);
    showToast($('trainer-toast'), 'Not that one — try again.');
    renderTrainerMoves();
    return true;
  }
  if (result.kind === 'correct') {
    if (move.captured) playCapture();
    else playMove();
    const intermediate = applyMove(prevState, move);
    trainerBoard?.setState(intermediate, [from, to]);
    renderTrainerMoves();
    window.setTimeout(() => {
      if (!trainerSession) return;
      trainerBoard?.setState(trainerSession.state, null);
      renderTrainerMoves();
      if (trainerSession.solved) {
        playSolved();
        if (trainerMode === 'rush') {
          rushScore++;
          rushCombo++;
          updateRushStatus();
          showToast($('trainer-toast'), `Solved! Score ${rushScore} · combo ×${rushCombo}`);
          window.setTimeout(() => void nextTrainerPuzzle(), 600);
        } else {
          showToast($('trainer-toast'), 'Solved! Loading the next one…');
          window.setTimeout(() => void nextTrainerPuzzle(), 900);
        }
      }
    }, 350);
    return true;
  }
  return false;
}

function renderTrainerMoves(): void {
  const el = $('trainer-moves');
  if (!trainerSession) {
    el.innerHTML = '<li class="empty">Pick a mode to begin.</li>';
    return;
  }
  if (trainerSession.movesPlayed.length === 0) {
    el.innerHTML = '<li class="empty">Your moves will appear here.</li>';
    return;
  }
  let html = '';
  for (let i = 0; i < trainerSession.movesPlayed.length; i += 2) {
    const ply = Math.floor(i / 2) + 1;
    html += `<li><span class="ply">${ply}.</span><span class="san-current">${trainerSession.movesPlayed[i]}</span>${trainerSession.movesPlayed[i + 1] ? `<span class="san-reply">${trainerSession.movesPlayed[i + 1]}</span>` : ''}</li>`;
  }
  el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
}

function loadTrainerPuzzle(item: PuzzleBatchItem): void {
  trainerSession = new PuzzleSession(puzzleDataFromBatch(item));
  trainerBoard?.setOrientation(trainerSession.sideToMove);
  trainerBoard?.setState(trainerSession.state, null);
  trainerBoard?.clearHint();
  trainerBoard?.setInteractive(true);
  $('trainer-side').textContent =
    trainerSession.sideToMove === 'w' ? 'White to move' : 'Black to move';
  $('trainer-meta').textContent =
    `Rated ${item.puzzle.rating} · ${item.puzzle.plays.toLocaleString('en-IN')} plays · themes: ${item.puzzle.themes.join(', ')}`;
  renderTrainerMoves();
}

async function refillTrainerQueue(): Promise<void> {
  if (trainerMode === 'rush') {
    trainerQueue = await fetchPuzzleBatch('mix', 20, 'normal');
  } else {
    trainerQueue = await fetchPuzzleBatch(trainerAngle, 10, trainerDifficulty);
  }
}

async function nextTrainerPuzzle(): Promise<void> {
  if (trainerQueue.length === 0) {
    try {
      await refillTrainerQueue();
    } catch {
      $('train-status').textContent = 'Could not fetch more puzzles — check your connection.';
      return;
    }
  }
  const item = trainerQueue.shift();
  if (item) loadTrainerPuzzle(item);
}

function updateRushStatus(): void {
  $('rush-clock').textContent = formatClock(rushSecondsLeft);
  $('rush-clock').classList.toggle('low', rushSecondsLeft <= 30);
  $('rush-score').textContent = `Score ${rushScore} · Combo ×${Math.max(1, rushCombo)} · Errors ${rushErrors}`;
}

function endRush(): void {
  if (rushTimer) window.clearInterval(rushTimer);
  rushTimer = null;
  trainerMode = 'idle';
  $('rush-clock').hidden = true;
  $('rush-score').hidden = true;
  $('rush-stop').hidden = true;
  ($('rush-start') as HTMLButtonElement).disabled = false;
  const stats = loadStats();
  if (rushScore > stats.rushBest) {
    stats.rushBest = rushScore;
    saveStats(stats);
  }
  $('rush-best').textContent = String(loadStats().rushBest);
  $('rush-status').innerHTML =
    `Rush over — you solved <strong>${rushScore}</strong> puzzles with ${rushErrors} wrong move${rushErrors === 1 ? '' : 's'}. Best: <strong>${loadStats().rushBest}</strong>.`;
  trainerBoard?.setInteractive(false);
}

async function startRush(): Promise<void> {
  trainerMode = 'rush';
  rushScore = 0;
  rushCombo = 0;
  rushErrors = 0;
  rushSecondsLeft = 180;
  ($('rush-start') as HTMLButtonElement).disabled = true;
  $('rush-clock').hidden = false;
  $('rush-score').hidden = false;
  $('rush-stop').hidden = false;
  $('train-status').textContent = '';
  updateRushStatus();
  try {
    trainerQueue = await fetchPuzzleBatch('mix', 20, 'normal');
  } catch {
    $('train-status').textContent = 'Could not reach Lichess — Rush needs a connection.';
    ($('rush-start') as HTMLButtonElement).disabled = false;
    return;
  }
  const item = trainerQueue.shift();
  if (item) loadTrainerPuzzle(item);
  rushTimer = window.setInterval(() => {
    rushSecondsLeft--;
    updateRushStatus();
    if (rushSecondsLeft <= 0) endRush();
  }, 1000);
}

async function startTrainingPuzzle(): Promise<void> {
  trainerMode = 'train';
  $('train-status').textContent = 'Fetching puzzles…';
  try {
    trainerQueue = await fetchPuzzleBatch(trainerAngle, 10, trainerDifficulty);
  } catch (err) {
    $('train-status').textContent =
      err instanceof LichessError ? err.message : 'Could not reach lichess.org.';
    return;
  }
  $('train-status').textContent = '';
  const item = trainerQueue.shift();
  if (item) loadTrainerPuzzle(item);
}

// ---------------------------------------------------------------------------
// Live TV
// ---------------------------------------------------------------------------

async function loadTvFeatured(): Promise<void> {
  try {
    const f = await fetchTvFeatured();
    $('tv-featured-board').innerHTML = miniBoardHtml(f.fen);
    const names = f.players.map((p) => {
      const name = p.user?.name ?? p.name ?? 'Anonymous';
      const title = p.user?.title ?? p.title;
      return `${title ? title + ' ' : ''}${name}${p.rating ? ' ' + p.rating : ''}`;
    });
    $('tv-featured-players').textContent =
      names.length >= 2 ? `${names[0]} — ${names[1]}` : 'Featured game';
    ($('tv-featured-link') as HTMLAnchorElement).href = `https://lichess.org/${f.id}`;
  } catch {
    $('tv-featured-players').textContent = 'No live game right now.';
    $('tv-featured-board').innerHTML = '';
  }
}

const CHANNEL_LABELS: Record<string, string> = {
  bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', classical: 'Classical',
  chess960: 'Chess960', kingOfTheHill: 'King of the Hill', threeCheck: 'Three-check',
  antichess: 'Antichess', atomic: 'Atomic', horde: 'Horde', racingKings: 'Racing Kings',
  crazyhouse: 'Crazyhouse', ultraBullet: 'UltraBullet', best: 'Top rated', bot: 'Bot', computer: 'Computer',
};

async function channelFen(ch: TvChannel): Promise<string | null> {
  const pgn = await fetchGamePgn(ch.gameId);
  if (!pgn) return null;
  const movetext = pgn.split('\n\n').slice(1).join(' ') || pgn;
  try {
    const sans = parsePgnMovetext(movetext);
    const states = replaySan(sans);
    return toFen(states[states.length - 1]);
  } catch {
    return null;
  }
}

async function loadTvChannels(): Promise<void> {
  const grid = $('channels-grid');
  try {
    const channels = await fetchTvChannels();
    const keys = Object.keys(channels).filter((k) => CHANNEL_LABELS[k]);
    grid.innerHTML = '';
    for (const key of keys) {
      const ch = channels[key];
      const card = document.createElement('div');
      card.className = 'channel-card';
      card.innerHTML =
        `<div class="tv-board" data-ch="${key}"><div class="mini-board"></div></div>` +
        `<h3>${CHANNEL_LABELS[key]}</h3>` +
        `<p>${ch.user ? `${ch.user.title ? ch.user.title + ' ' : ''}${ch.user.name}${ch.rating ? ' · ' + ch.rating : ''}` : 'Live game'}</p>` +
        `<a href="https://lichess.org/${ch.gameId}" target="_blank" rel="noopener">Watch ↗</a>`;
      grid.appendChild(card);
      // Fetch the live position for the mini board (best effort, in parallel).
      void channelFen(ch).then((fen) => {
        const host = card.querySelector(`[data-ch="${key}"]`);
        if (host && fen) host.innerHTML = miniBoardHtml(fen);
      });
    }
  } catch {
    grid.innerHTML = '<p class="card-error">Live channels unavailable — try again.</p>';
  }
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

async function loadLeaderboard(perf: string): Promise<void> {
  const list = $('leaderboard-list');
  const errEl = $('leaderboard-error');
  errEl.hidden = true;
  list.innerHTML = '<li>Loading…</li>';
  try {
    const users = await fetchTopPlayers(perf, 10);
    if (users.length === 0) {
      list.innerHTML = '<li>No players returned.</li>';
      return;
    }
    list.innerHTML = users
      .map((u, i) => {
        const rating = u.perfs[perf]?.rating ?? 0;
        return `<li><span class="lb-rank${i === 0 ? ' first' : ''}">${i + 1}</span>` +
          `<span class="lb-name"><a href="https://lichess.org/@/${encodeURIComponent(u.username)}" target="_blank" rel="noopener">${u.title ? u.title + ' ' : ''}${u.username}</a></span>` +
          `<span class="lb-rating">${rating.toLocaleString('en-IN')}</span></li>`;
      })
      .join('');
  } catch {
    list.innerHTML = '';
    errEl.textContent = 'Leaderboard unavailable — try again.';
    errEl.hidden = false;
  }
}

// ---------------------------------------------------------------------------
// Player lookup
// ---------------------------------------------------------------------------

function ratingChartSvg(points: [number, number, number, number][], color = '#16A34A'): string {
  if (points.length < 2) return '';
  const ratings = points.map((p) => p[3]);
  const min = Math.min(...ratings);
  const max = Math.max(...ratings);
  const span = Math.max(1, max - min);
  const w = 600;
  const h = 120;
  const step = w / (points.length - 1);
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - 8 - ((p[3] - min) / span) * (h - 16)).toFixed(1)}`)
    .join(' ');
  return `<svg class="rating-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" fill="none" stroke="${color}" stroke-width="2"/></svg>`;
}

async function lookupPlayer(username: string): Promise<void> {
  const result = $('lookup-result');
  result.innerHTML = '<p>Looking up…</p>';
  try {
    const user = await fetchUser(username);
    if (user.disabled) {
      result.innerHTML = `<p class="lookup-error">The account “${user.username}” is closed or disabled on Lichess.</p>`;
      return;
    }
    const [history, storm] = await Promise.all([
      fetchRatingHistory(username).catch(() => [] as never[]),
      fetchStormDashboard(username).catch(() => null),
    ]);
    const perfs = user.perfs ?? {};
    const perfHtml = Object.entries(perfs)
      .filter(([, v]) => v.games > 0)
      .sort((a, b) => b[1].rating - a[1].rating)
      .slice(0, 8)
      .map(([k, v]) => `<span>${k}: <b>${v.rating.toLocaleString('en-IN')}</b> (${v.games.toLocaleString('en-IN')} games)</span>`)
      .join('');
    const bestHistory = [...history].sort((a, b) => b.points.length - a.points.length)[0];
    const stormHtml = storm?.high
      ? `<div>Storm highs — day <b>${storm.high.day}</b> · week <b>${storm.high.week}</b> · month <b>${storm.high.month}</b> · all-time <b>${storm.high.allTime}</b></div>`
      : '<div style="color:var(--muted)">No Puzzle Storm data for this account.</div>';
    result.innerHTML =
      `<div class="lookup-profile"><h3>${flagEmoji(user.profile?.country)} ${user.title ? user.title + ' ' : ''}${user.username}</h3>` +
      `<div style="color:var(--muted);font-size:14px">${user.online ? 'Online now' : 'Offline'}${user.createdAt ? ' · on Lichess since ' + new Date(user.createdAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : ''}${user.count ? ` · ${user.count.all.toLocaleString('en-IN')} games played` : ''}</div>` +
      `<div class="lookup-perfs">${perfHtml || '<span>No rated games.</span>'}</div>` +
      (bestHistory && bestHistory.points.length > 1
        ? `<div><div class="label">${bestHistory.name} rating history (${bestHistory.points.length} points)</div>${ratingChartSvg(bestHistory.points)}</div>`
        : '<div style="color:var(--muted)">No rated history for this account.</div>') +
      stormHtml +
      `<div><a href="https://lichess.org/@/${encodeURIComponent(user.username)}" target="_blank" rel="noopener">Open profile on Lichess ↗</a></div></div>`;
  } catch (err) {
    if (err instanceof LichessError && err.status === 404) {
      result.innerHTML = `<p class="lookup-error">No Lichess user called “${username}” — check the spelling.</p>`;
    } else {
      result.innerHTML = '<p class="lookup-error">Lookup failed — check your connection and try again.</p>';
    }
  }
}

// ---------------------------------------------------------------------------
// Archive + streak calendar
// ---------------------------------------------------------------------------

function renderArchive(): void {
  const list = $('archive-list');
  const records = loadArchive();
  if (records.length === 0) {
    list.innerHTML = '<li>Your archive starts today — come back tomorrow for a second entry.</li>';
    return;
  }
  list.innerHTML = records
    .slice(0, 7)
    .map((r: DayRecord) => {
      const d = new Date(r.date + 'T12:00:00');
      return `<li><span class="arch-date">${formatDateShort(d)}</span>` +
        `<span class="arch-rating">rated ${r.rating}</span>` +
        `<span class="${r.solved ? 'solved-mark' : 'unsolved-mark'}">${r.solved ? '✓ solved' : '○ unsolved'}</span>` +
        `<button type="button" data-puzzle="${r.puzzleId}">Replay</button></li>`;
    })
    .join('');
  list.querySelectorAll('button[data-puzzle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLButtonElement).dataset.puzzle;
      if (!id) return;
      void (async () => {
        try {
          const d = await fetchPuzzleById(id);
          loadPuzzleIntoHero(puzzleDataFromDaily(d));
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch {
          showToast($('board-toast'), 'That puzzle could not be loaded.');
        }
      })();
    });
  });
}

function renderStreakCal(): void {
  const cal = $('streak-cal');
  const days = lastNDays(loadArchive(), 28, dateKey(new Date()));
  cal.innerHTML = days
    .map((d) => {
      const day = new Date(d.date + 'T12:00:00');
      return `<div class="cal-day${d.solved ? ' solved' : ''}" title="${d.date}${d.solved ? ' — solved' : ''}">${day.getDate()}</div>`;
    })
    .join('');
}

// ---------------------------------------------------------------------------
// Tournaments + broadcasts
// ---------------------------------------------------------------------------

async function loadTournaments(): Promise<void> {
  const list = $('tournament-list');
  try {
    const t = await fetchTournaments();
    const live = t.started.slice(0, 8);
    if (live.length === 0) {
      list.innerHTML = '<li>No tournaments running right now.</li>';
      return;
    }
    list.innerHTML = live
      .map((x) => `<li><a href="https://lichess.org/tournament/${x.id}" target="_blank" rel="noopener">${x.fullName}</a> <span class="t-meta">· ${x.variant?.name ?? ''} · ${x.nbPlayers ?? 0} players</span></li>`)
      .join('');
  } catch {
    list.innerHTML = '<li>Tournaments unavailable right now.</li>';
  }
}

async function loadBroadcasts(): Promise<void> {
  const list = $('broadcast-list');
  try {
    const b = await fetchBroadcastTop();
    const tours = b.tours.slice(0, 8);
    if (tours.length === 0) {
      list.innerHTML = '<li>No official broadcasts right now.</li>';
      return;
    }
    list.innerHTML = tours
      .map((x) => `<li><a href="https://lichess.org/broadcast/${x.slug}/${x.id}" target="_blank" rel="noopener">${x.name}</a> <span class="t-meta">${x.timeControl ? '· ' + x.timeControl : ''}</span></li>`)
      .join('');
  } catch {
    list.innerHTML = '<li>Broadcasts unavailable right now.</li>';
  }
}

// ---------------------------------------------------------------------------
// Share result card
// ---------------------------------------------------------------------------

function shareResult(): void {
  if (!session || !session.solved) return;
  const secs = session.elapsedSeconds();
  const streak = currentStreak(loadArchive(), dateKey(new Date()));
  const text = `Solved today's ChessPulse puzzle (rated ${session.data.rating}) in ${formatClock(secs)} — streak ${streak} 🔥 Play free at https://judd69.github.io/chesspulse/`;
  const canvas = $('share-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#FAFAF7';
    ctx.fillRect(0, 0, 1080, 566);
    ctx.fillStyle = '#111111';
    ctx.font = '700 64px Georgia, serif';
    ctx.fillText('ChessPulse', 64, 110);
    ctx.font = '28px Georgia, serif';
    ctx.fillText(`Today's puzzle — rated ${session.data.rating}`, 64, 170);
    ctx.font = '700 52px Georgia, serif';
    ctx.fillStyle = '#16A34A';
    ctx.fillText(`Solved in ${formatClock(secs)}`, 64, 260);
    ctx.fillStyle = '#111111';
    ctx.font = '32px system-ui, sans-serif';
    ctx.fillText(`Streak ${streak}  ·  ${session.hearts} of 5 hearts left`, 64, 320);
    ctx.fillStyle = '#6B6B66';
    ctx.font = '26px system-ui, sans-serif';
    ctx.fillText('No account. No ads. One puzzle a day.', 64, 380);
    ctx.fillText('judd69.github.io/chesspulse', 64, 430);
    // Mini board motif: 8×8 parchment/slate squares, bottom right.
    const bx = 800;
    const by = 180;
    const sq = 34;
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        ctx.fillStyle = (r + f) % 2 === 0 ? '#5B6B7A' : '#F2EDE3';
        ctx.fillRect(bx + f * sq, by + r * sq, sq, sq);
      }
    }
    ctx.strokeStyle = '#E5E5DE';
    ctx.strokeRect(bx, by, sq * 8, sq * 8);
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `chesspulse-${dateKey(new Date())}.png`;
    a.click();
  }
  if (navigator.clipboard) {
    void navigator.clipboard.writeText(text).catch(() => undefined);
  }
  showToast($('board-toast'), 'Result card downloaded — text copied to clipboard.');
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function initThemeChips(): void {
  const row = $('theme-chips');
  const shown = PUZZLE_ANGLES.filter((a) =>
    ['mix', 'mate', 'mateIn1', 'mateIn2', 'mateIn3', 'fork', 'pin', 'skewer', 'sacrifice', 'discoveredAttack', 'quietMove', 'backRankMate'].includes(a.angle),
  );
  row.innerHTML = '';
  for (const a of shown) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-chip' + (a.angle === trainerAngle ? ' active' : '');
    btn.textContent = a.label;
    btn.addEventListener('click', () => {
      trainerAngle = a.angle;
      row.querySelectorAll('.theme-chip').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
    });
    row.appendChild(btn);
  }
}

function initSoundToggle(): void {
  const btn = $('sound-toggle');
  const sync = (): void => {
    btn.setAttribute('aria-pressed', String(isSoundEnabled()));
    btn.textContent = isSoundEnabled() ? 'Sound on' : 'Sound off';
  };
  btn.addEventListener('click', () => {
    setSoundEnabled(!isSoundEnabled());
    sync();
    if (isSoundEnabled()) playMove();
  });
  sync();
}

function init(): void {
  $('nav-date').textContent = formatDateLong(new Date());
  initThemeChips();
  initSoundToggle();
  renderStatsLine();
  renderArchive();
  renderStreakCal();
  $('rush-best').textContent = String(loadStats().rushBest);

  heroBoard = new BoardView($('board'), {
    orientation: 'w',
    interactive: true,
    callbacks: { onMove: heroOnMove, legalTargets: heroLegalTargets },
  });
  trainerBoard = new BoardView($('trainer-board'), {
    orientation: 'w',
    interactive: false,
    callbacks: { onMove: trainerOnMove, legalTargets: trainerLegalTargets },
  });
  renderTrainerMoves();

  $('hint-btn').addEventListener('click', heroHint);
  $('solution-btn').addEventListener('click', heroSolution);
  $('replay-game').addEventListener('click', startReplay);
  $('replay-back').addEventListener('click', () => {
    stopReplay();
    heroBoard?.setInteractive(true);
    if (session) heroBoard?.setState(session.state, heroLastMove);
  });
  $('next-puzzle-btn').addEventListener('click', () => {
    void (async () => {
      try {
        const item = await fetchPuzzleBatch('mix', 1, 'normal');
        if (item[0]) loadPuzzleIntoHero(puzzleDataFromBatch(item[0]));
      } catch {
        showToast($('board-toast'), 'Could not fetch another puzzle.');
      }
    })();
  });
  $('share-btn').addEventListener('click', shareResult);

  $('rush-start').addEventListener('click', () => void startRush());
  $('rush-stop').addEventListener('click', endRush);
  $('difficulty').addEventListener('change', (e) => {
    trainerDifficulty = (e.target as HTMLSelectElement).value;
  });
  $('train-start').addEventListener('click', () => void startTrainingPuzzle());
  $('trainer-next').addEventListener('click', () => void nextTrainerPuzzle());
  $('trainer-hint').addEventListener('click', () => {
    if (!trainerSession) return;
    const h = trainerSession.hint();
    if (!h) return;
    if (h.step === 1) {
      trainerBoard?.showHint(h.from, null);
      showToast($('trainer-toast'), 'The piece to move is highlighted.');
    } else {
      trainerBoard?.showHint(h.from, h.to);
    }
  });
  $('trainer-solution').addEventListener('click', () => {
    if (!trainerSession) return;
    const { moves } = trainerSession.revealSolution();
    trainerBoard?.setInteractive(false);
    let i = 0;
    let s = trainerSession.state;
    const step = (): void => {
      if (i >= moves.length) {
        trainerBoard?.setInteractive(true);
        return;
      }
      s = applyMove(s, moves[i]);
      trainerSession!.state = s;
      trainerBoard?.setState(s, [moves[i].from, moves[i].to]);
      i++;
      window.setTimeout(step, 500);
    };
    step();
  });

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      void loadLeaderboard((tab as HTMLElement).dataset.perf ?? 'classical');
    });
  });

  $('lookup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = ($('lookup-input') as HTMLInputElement).value.trim();
    if (name) void lookupPlayer(name);
  });

  void loadDailyPuzzle();
  void loadLeaderboard('classical');
  void loadTvFeatured();
  void loadTvChannels();
  void loadTournaments();
  void loadBroadcasts();
  window.setInterval(() => {
    void loadTvChannels();
    void loadTvFeatured();
  }, 30000);
}

init();
