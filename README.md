# ChessPulse — one puzzle a day, no account, no ads

A focused daily-puzzle page on live Lichess data: today's puzzle on a real
board, Puzzle Rush, train by theme, engine hints, live TV games,
leaderboards, player lookup, a working archive and local streaks. No login,
no ads, no paywall, no comments, no daily cap.

**Live demo:** https://judd69.github.io/chesspulse/ (Pages flip pending — Jude's step)
**Repo:** https://github.com/judd69/chesspulse

## Features

1. **Daily puzzle, playable** — today's Lichess puzzle (`/api/puzzle/daily`)
   on a hand-rolled board: click, drag, or type moves (`e2` then `e4`).
   Correct moves play the scripted reply; wrong-but-legal moves cost one of
   5 hearts; Hint (two-step, free) and Reveal solution are free. Streak,
   solves, best streak and average time live in `localStorage` — no account.
2. **Full-game replay** — every daily puzzle comes from a real game; "Replay
   the full game" steps through the whole PGN on the same board and returns
   to the puzzle position. The opening is named from a bundled reference
   table of common openings (labelled as such — the live explorer is blocked).
3. **Puzzle Rush** — 3-minute sprint, 20 puzzles prefetched in one batch
   (`/api/puzzle/batch/mix`), score + combo, best score saved locally.
4. **Train by theme + difficulty** — 12 theme chips (Mate, Fork, Pin,
   Sacrifice, …) × 5 difficulties, endless batched puzzles.
5. **Engine hints + eval bar** — Lichess cloud eval (`/api/cloud-eval`,
   multi-PV 3) with an eval bar and best lines. A 404 cache-miss is handled
   gracefully ("no engine eval cached for this position").
6. **Live games browser** — Lichess TV featured game plus all 16 TV channels,
   each with a mini board rendered from its live position, refreshed every
   30 seconds.
7. **Leaderboards** — live top 10 for Classical / Rapid / Blitz
   (`/api/player/top/10/{perf}`). (No puzzle leaderboard exists on Lichess —
   the page says so instead of inventing one.)
8. **Player lookup** — any Lichess username: profile, per-control ratings,
   rating-history chart, Puzzle Storm highs. Disabled accounts and unknown
   users are handled with plain messages.
9. **Working archive + streak calendar** — Lichess has no date-indexed
   archive, so every day you visit, that day's puzzle ID is saved locally
   and becomes replayable; a 28-day solved-day calendar grows with it.
10. **Live tournaments + broadcasts** — running arenas and official broadcasts.
11. **Tablebase verdict** — positions with ≤7 pieces show the exact verdict
    from `tablebase.lichess.ovh`.
12. **Shareable result card** — after solving, download a PNG result card
    (canvas) and copy the result text.
13. **Sound + keyboard entry** — Web Audio move/capture/solve sounds
    (toggleable) and full keyboard play (type squares, arrow keys + Enter).

## Honest labelling

- Puzzle validation **replays the published solution line** — it does not run
  an engine to judge arbitrary moves. A legal move that isn't the published
  move loses a heart.
- All ratings, games, puzzles and evals come from Lichess at runtime. If
  Lichess is unreachable, the page says so and offers a retry or a training
  puzzle — it never invents data.
- Opening names come from a small bundled reference table, not the live
  explorer (the explorer endpoints return 401 from this sandbox).
- Promotion defaults to queen in free play; puzzle lines spell out
  underpromotions in their UCI.

## How it works (for the DSA write-up)

**Problem.** Turn a live stream of Lichess puzzle/game data into a playable,
correct chess board in the browser with no backend and no account — the board
must know which moves are legal, what a move is called in standard notation,
and whether a position is check, mate or stalemate.

**Data structures.**
- **Board: a 64-element array** (`board[rank*8 + file]`, a1 = 0). One lookup
  per square, no hashing, trivial to clone for move trial.
- **Game state: board + side to move + castling rights + en-passant square +
  half/fullmove clocks** — exactly a FEN, so any position round-trips through
  `parseFen`/`toFen` and can be fed to the cloud-eval and tablebase APIs.
- **Move generation: pseudo-legal generation + king-safety filter.**
  Generate every pseudo-legal move for the side to move, apply it to a
  cloned board, and keep it only if the mover's king is not under attack.
  Verified against known perft counts: start position depth 3 = 8,902 nodes;
  Kiwipete depth 2 = 2,039; the en-passant/pin test position depth 2 = 191.
- **SAN (standard algebraic notation):** generated from the legal move list
  with disambiguation (file, then rank, then both) and `+`/`#` suffixes;
  parsing a SAN move is a lookup over the same list, which also resolves
  castling, en passant and promotion.
- **Puzzle session: a finite-state machine** over the published solution
  (UCI list) — expected-move pointer, hearts counter, hint step, timer.
  The full game behind the puzzle is stored as the list of states after each
  ply, so replay is an index walk, not recomputation.
- **Local persistence: two `localStorage` keys** (stats, archive) — the
  streak is computed by walking backwards over consecutive solved dates.

**Stack.** TypeScript (Vite + vanilla TS, Vitest), zero runtime dependencies.
`docs/` ships the production build (relative base) for GitHub Pages.

## Verified live data (build day, 17 Nov 2026)

Today's daily puzzle when built: **etYYx, rated 1875**, from
burimbaba (2183) vs neroli (2390), Blitz, 115,932 plays; solution
`Qxf7+ Rxf7 Rd8+ Rf8 Rg7+ Kh8 Rxf8#` (7 moves, 4 solver moves). The puzzle
rating is a live Glicko value — it drifted during the build day
(1875 → 1814 → 1756 → 1677) as more people solved it, which is expected.
Snapshots: `examples/puzzle-daily-2026-11-17.json`,
`examples/top10-blitz-2026-11-17.json` (top: AWorldIDontKnow, Blitz 2935),
`examples/tv-channels-2026-11-17.json` (16 channels).

## Verification (this run)

- **Tests: 45/45 Vitest green** — engine perft counts (8,902 / 2,039 / 191),
  Fool's-mate checkmate, stalemate, castling, en passant, promotion SAN,
  the full real daily-puzzle line solved move-by-move, hint steps, format
  helpers, ECO lookup, storage/streak math, fixture shapes.
- **Production build:** `npm run build` clean; `docs/` serves 200 locally
  (index 11,992 B, JS 51.79 kB, CSS 12.87 kB, relative asset paths only).
- **End-to-end render test** (jsdom + real Lichess, 27 checks, all passing):
  board renders 64 squares with the live puzzle position; Qxf7+ played by
  clicking and the scripted reply Rxf7 appears; a wrong move loses a heart;
  leaderboard loads 10 rows; TV featured game shows real players
  (GM HowellHub 2926); all 16 channels render mini boards; Rush starts and
  loads a batch puzzle with a counting clock; Train loads a themed puzzle
  (rated 1537, themes endgame/crushing/long/discoveredAttack); player lookup
  for `thibault` renders his profile (on Lichess since Nov 2010, 23,940 games).
- **Bugs found and fixed by the render test:** TV feed player names are
  nested under `user.name` (was rendering "undefined"); batch `themes` is an
  array, not a string (crashed Rush/Train load). Also fixed during testing:
  Lichess's `initialPly` is the 0-based index of the last game ply, so the
  puzzle starts at `initialPly + 1` — the session now picks the earliest
  state where the published solution line is playable.
- **Not verified in this sandbox:** no headless Chromium exists here, so the
  render check ran in jsdom (no real layout/paint); worth one look in a real
  browser after the Pages flip. Live fetches from a real browser are
  unproven from this sandbox (all endpoints returned 200 + CORS `*` via curl).

## Run it

```sh
npm install
npm test        # 45 Vitest tests
npm run build   # tsc + vite -> docs/
npm run dev     # local dev server
```

## Files to push

README.md, LICENSE, .gitignore, package.json, package-lock.json,
tsconfig.json, vite.config.ts, index.html, src/*.ts (10 files), tests/*.ts
(5 files), examples/*.json (3 files), docs/index.html,
docs/assets/index-*.js, docs/assets/index-*.css.
`node_modules/` and `dist/` are gitignored, not for push.
