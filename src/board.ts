// ChessPulse — the board component (hand-rolled, no chessboard.js).
// The board IS the product: parchment #F2EDE3 / slate #5B6B7A squares,
// ink legal-move dots, green last-move wash, red check wash.
// Click-to-move, drag, and keyboard entry (type e2, then e4).

import {
  sqName,
  sqIndex,
  fileOf,
  rankOf,
  inCheck,
  findKing,
  type GameState,
} from './chess';
import { pieceSvg } from './pieces';

export interface BoardCallbacks {
  /** Called when the user attempts a move. Return true if accepted. */
  onMove?: (from: number, to: number, promotion: string | null) => boolean;
  /** Legal destination squares for a piece on `from` (empty = none). */
  legalTargets?: (from: number) => number[];
}

export class BoardView {
  private el: HTMLElement;
  private squares: HTMLButtonElement[] = [];
  private arrowSvg: SVGSVGElement | null = null;
  private state: GameState | null = null;
  private orientation: 'w' | 'b';
  private interactive: boolean;
  private cb: BoardCallbacks;
  private selected: number | null = null;
  private lastMove: [number, number] | null = null;
  private hintFrom: number | null = null;
  private hintTo: number | null = null;
  private keyBuffer = '';
  private keySquare: number | null = null;
  private dragFrom: number | null = null;

  constructor(container: HTMLElement, opts: {
    orientation: 'w' | 'b';
    interactive: boolean;
    callbacks?: BoardCallbacks;
    coordinates?: boolean;
  }) {
    this.el = container;
    this.orientation = opts.orientation;
    this.interactive = opts.interactive;
    this.cb = opts.callbacks ?? {};
    this.el.classList.add('cp-board');
    this.el.setAttribute('role', 'grid');
    this.el.setAttribute('aria-label', 'Chess board');
    if (opts.interactive) this.el.tabIndex = 0;

    const showCoords = opts.coordinates !== false;
    for (let displayRank = 0; displayRank < 8; displayRank++) {
      for (let displayFile = 0; displayFile < 8; displayFile++) {
        const r = this.orientation === 'w' ? 7 - displayRank : displayRank;
        const f = this.orientation === 'w' ? displayFile : 7 - displayFile;
        const idx = r * 8 + f;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cp-sq ' + ((r + f) % 2 === 0 ? 'dark' : 'light');
        btn.dataset.sq = String(idx);
        btn.setAttribute('role', 'gridcell');
        if (showCoords) {
          if (f === 0) {
            const rankLabel = document.createElement('span');
            rankLabel.className = 'coord rank';
            rankLabel.textContent = String(r + 1);
            btn.appendChild(rankLabel);
          }
          if (r === 0) {
            const fileLabel = document.createElement('span');
            fileLabel.className = 'coord file';
            fileLabel.textContent = 'abcdefgh'[f];
            btn.appendChild(fileLabel);
          }
        }
        const pieceSpan = document.createElement('span');
        pieceSpan.className = 'piece';
        btn.appendChild(pieceSpan);
        btn.addEventListener('click', () => this.handleClick(idx));
        btn.addEventListener('pointerdown', (e) => {
          this.dragFrom = idx;
          if (e.pointerType === 'mouse') e.preventDefault();
        });
        btn.addEventListener('pointerup', () => {
          if (this.dragFrom !== null && this.dragFrom !== idx) {
            const from = this.dragFrom;
            this.dragFrom = null;
            this.attemptMove(from, idx);
          } else {
            this.dragFrom = null;
          }
        });
        this.squares.push(btn);
        this.el.appendChild(btn);
      }
    }
    // Arrow overlay (hint arrows), drawn above the squares.
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'cp-arrows');
    svg.setAttribute('viewBox', '0 0 800 800');
    svg.setAttribute('aria-hidden', 'true');
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML =
      '<marker id="cp-arrowhead" markerWidth="8" markerHeight="8" refX="5" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#16A34A"/></marker>';
    svg.appendChild(defs);
    this.el.appendChild(svg);
    this.arrowSvg = svg;

    if (opts.interactive) {
      this.el.addEventListener('keydown', (e) => this.handleKey(e));
    }
  }

  setOrientation(o: 'w' | 'b'): void {
    if (o === this.orientation) return;
    this.orientation = o;
    // Rebuild square order: simplest correct approach is to re-render.
    this.el.innerHTML = '';
    this.squares = [];
    const showCoords = true;
    for (let displayRank = 0; displayRank < 8; displayRank++) {
      for (let displayFile = 0; displayFile < 8; displayFile++) {
        const r = this.orientation === 'w' ? 7 - displayRank : displayRank;
        const f = this.orientation === 'w' ? displayFile : 7 - displayFile;
        const idx = r * 8 + f;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cp-sq ' + ((r + f) % 2 === 0 ? 'dark' : 'light');
        btn.dataset.sq = String(idx);
        btn.setAttribute('role', 'gridcell');
        if (showCoords) {
          if (f === 0) {
            const rankLabel = document.createElement('span');
            rankLabel.className = 'coord rank';
            rankLabel.textContent = String(r + 1);
            btn.appendChild(rankLabel);
          }
          if (r === 0) {
            const fileLabel = document.createElement('span');
            fileLabel.className = 'coord file';
            fileLabel.textContent = 'abcdefgh'[f];
            btn.appendChild(fileLabel);
          }
        }
        const pieceSpan = document.createElement('span');
        pieceSpan.className = 'piece';
        btn.appendChild(pieceSpan);
        btn.addEventListener('click', () => this.handleClick(idx));
        btn.addEventListener('pointerdown', (e) => {
          this.dragFrom = idx;
          if (e.pointerType === 'mouse') e.preventDefault();
        });
        btn.addEventListener('pointerup', () => {
          if (this.dragFrom !== null && this.dragFrom !== idx) {
            const from = this.dragFrom;
            this.dragFrom = null;
            this.attemptMove(from, idx);
          } else {
            this.dragFrom = null;
          }
        });
        this.squares.push(btn);
        this.el.appendChild(btn);
      }
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'cp-arrows');
    svg.setAttribute('viewBox', '0 0 800 800');
    svg.setAttribute('aria-hidden', 'true');
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML =
      '<marker id="cp-arrowhead" markerWidth="8" markerHeight="8" refX="5" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#16A34A"/></marker>';
    svg.appendChild(defs);
    this.el.appendChild(svg);
    this.arrowSvg = svg;
    if (this.state) this.render();
  }

  setInteractive(on: boolean): void {
    this.interactive = on;
    this.el.tabIndex = on ? 0 : -1;
    if (!on) this.clearSelection();
  }

  setState(state: GameState, lastMove: [number, number] | null = null): void {
    this.state = state;
    this.lastMove = lastMove;
    this.render();
  }

  getState(): GameState | null {
    return this.state;
  }

  showHint(from: number, to: number | null): void {
    this.hintFrom = from;
    this.hintTo = to;
    this.render();
  }

  clearHint(): void {
    this.hintFrom = null;
    this.hintTo = null;
    if (this.arrowSvg) {
      this.arrowSvg.querySelectorAll('line').forEach((l) => l.remove());
    }
    this.render();
  }

  clearSelection(): void {
    this.selected = null;
    this.render();
  }

  private render(): void {
    if (!this.state) return;
    const checkSq = this.checkSquare();
    for (const btn of this.squares) {
      const idx = Number(btn.dataset.sq);
      const p = this.state.board[idx];
      const pieceSpan = btn.querySelector('.piece') as HTMLElement;
      pieceSpan.innerHTML = p ? pieceSvg(p.type, p.color) : '';
      btn.classList.toggle('last-move', !!this.lastMove && (this.lastMove[0] === idx || this.lastMove[1] === idx));
      btn.classList.toggle('check', checkSq === idx);
      btn.classList.toggle('selected', this.selected === idx);
      btn.classList.toggle('hint-from', this.hintFrom === idx);
      btn.classList.toggle('hint-to', this.hintTo === idx);
      btn.classList.toggle('key-focus', this.keySquare === idx);
      btn.querySelectorAll('.dot,.ring').forEach((d) => d.remove());
      const label = `${sqName(idx)}${p ? `, ${p.color === 'w' ? 'white' : 'black'} ${pieceName(p.type)}` : ', empty'}`;
      btn.setAttribute('aria-label', label);
      if (this.selected !== null && this.cb.legalTargets) {
        const targets = this.cb.legalTargets(this.selected);
        if (targets.includes(idx)) {
          const mark = document.createElement('span');
          const occupied = !!this.state.board[idx];
          mark.className = occupied ? 'ring' : 'dot';
          btn.appendChild(mark);
        }
      }
    }
    // Hint arrow
    if (this.arrowSvg) {
      this.arrowSvg.querySelectorAll('line').forEach((l) => l.remove());
      if (this.hintFrom !== null && this.hintTo !== null) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        const [x1, y1] = this.squareCenter(this.hintFrom);
        const [x2, y2] = this.squareCenter(this.hintTo);
        line.setAttribute('x1', String(x1));
        line.setAttribute('y1', String(y1));
        line.setAttribute('x2', String(x2));
        line.setAttribute('y2', String(y2));
        line.setAttribute('stroke', '#16A34A');
        line.setAttribute('stroke-width', '14');
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('marker-end', 'url(#cp-arrowhead)');
        line.setAttribute('opacity', '0.85');
        this.arrowSvg.appendChild(line);
      }
    }
  }

  private squareCenter(idx: number): [number, number] {
    const f = fileOf(idx);
    const r = rankOf(idx);
    const df = this.orientation === 'w' ? f : 7 - f;
    const dr = this.orientation === 'w' ? 7 - r : r;
    return [df * 100 + 50, dr * 100 + 50];
  }

  private checkSquare(): number | null {
    if (!this.state) return null;
    if (!inCheck(this.state, this.state.turn)) return null;
    return findKing(this.state.board, this.state.turn);
  }

  private handleClick(idx: number): void {
    if (!this.interactive || !this.state) return;
    if (this.selected !== null && this.selected !== idx) {
      if (this.attemptMove(this.selected, idx)) return;
    }
    const p = this.state.board[idx];
    if (p && p.color === this.state.turn) {
      this.selected = idx;
      this.render();
    } else {
      this.selected = null;
      this.render();
    }
  }

  private attemptMove(from: number, to: number): boolean {
    if (!this.interactive || !this.state || !this.cb.onMove) return false;
    const targets = this.cb.legalTargets ? this.cb.legalTargets(from) : [];
    if (targets.length > 0 && !targets.includes(to)) {
      // Not a legal target: reselect if it's our own piece, else clear.
      const p = this.state.board[to];
      if (p && p.color === this.state.turn) {
        this.selected = to;
        this.render();
      } else {
        this.selected = null;
        this.render();
      }
      return false;
    }
    const piece = this.state.board[from];
    let promotion: string | null = null;
    if (piece && piece.type === 'p' && (rankOf(to) === 0 || rankOf(to) === 7)) {
      promotion = 'q'; // auto-queen; puzzles spell underpromotion in the UCI line
    }
    const ok = this.cb.onMove(from, to, promotion);
    if (ok) {
      this.selected = null;
      this.keyBuffer = '';
    }
    return ok;
  }

  private handleKey(e: KeyboardEvent): void {
    if (!this.interactive || !this.state) return;
    const key = e.key;
    if (key === 'Escape') {
      this.selected = null;
      this.keyBuffer = '';
      this.keySquare = null;
      this.render();
      return;
    }
    if (/^[a-h1-8]$/.test(key)) {
      e.preventDefault();
      this.keyBuffer += key;
      if (this.keyBuffer.length === 2) {
        const sq = this.keyBuffer;
        this.keyBuffer = '';
        try {
          const idx = sqIndex(sq);
          this.keySquare = idx;
          const p = this.state.board[idx];
          if (this.selected !== null && this.selected !== idx) {
            this.attemptMove(this.selected, idx);
          } else if (p && p.color === this.state.turn) {
            this.selected = idx;
          }
          this.render();
        } catch {
          /* invalid square — ignore */
        }
      } else if (this.keyBuffer.length > 2) {
        this.keyBuffer = key;
      }
      return;
    }
    if (key.startsWith('Arrow')) {
      e.preventDefault();
      const cur = this.keySquare ?? (this.orientation === 'w' ? 4 : 60);
      let f = fileOf(cur);
      let r = rankOf(cur);
      if (key === 'ArrowLeft') f = Math.max(0, f - 1);
      if (key === 'ArrowRight') f = Math.min(7, f + 1);
      if (key === 'ArrowUp') r = Math.min(7, r + 1);
      if (key === 'ArrowDown') r = Math.max(0, r - 1);
      this.keySquare = r * 8 + f;
      this.render();
      return;
    }
    if ((key === 'Enter' || key === ' ') && this.keySquare !== null) {
      e.preventDefault();
      this.handleClick(this.keySquare);
    }
  }
}

function pieceName(t: string): string {
  return (
    { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' } as Record<string, string>
  )[t] ?? t;
}
