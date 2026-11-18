// ChessPulse — piece artwork.
// Original simplified silhouettes drawn for this project (not copied Cburnett
// paths): white pieces are paper-filled with an ink outline, black pieces are
// ink-filled with a paper outline, per the UI brief §3.5.

import type { PieceType } from './chess';

// Each path is drawn in a 45×45 viewBox.
const PATHS: Record<PieceType, string> = {
  p: 'M22.5 7.5a5 5 0 1 1 0 10 5 5 0 0 1 0-10z M17.5 20c1.5-1.6 3.2-2.4 5-2.4s3.5.8 5 2.4c1.8 2 2.8 4.6 2.8 7.4v3.1H14.7v-3.1c0-2.8 1-5.4 2.8-7.4z M13 33.5h19v3.5H13z M11.5 38.5h22v2.5h-22z',
  r: 'M13.5 9h5v4.5h3.5V9h3.5v4.5H29V9h5l-1.5 10h-19z M15 20.5h15l1.5 9h-18z M13.5 31h18v3.5h-18z M12 36h21v3h-21z',
  n: 'M13 39.5V30c0-4.5 1.5-8 4.5-10.5l-2-4.5 4.5 1.5L24.5 12l1 4.5c3.5 1 6 3.5 6.5 7.5l.5 5.5c.2 2.5 1 4.5 2.5 6v4z M20 21.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6z',
  b: 'M22.5 5.5c-1.2 2-2.6 3.6-3.6 5.5-1.5 2.8-2.4 5-2.4 7 0 2 1 3.2 2.3 4.1-2.5 1-4.3 2.6-4.3 4.9 0 1.5 1 2.5 2.5 3l-1 3h13l-1-3c1.5-.5 2.5-1.5 2.5-3 0-2.3-1.8-3.9-4.3-4.9 1.3-.9 2.3-2.1 2.3-4.1 0-2-.9-4.2-2.4-7-1-1.9-2.4-3.5-3.6-5.5z M21 13.5h3l.8 3.4h-4.6z M13 35.5h19v3h-19z',
  q: 'M12 12.5l3.5 2.5L17 9.5l3 4 2.5-5 2.5 5 3-4 1.5 5.5 3.5-2.5-1.5 9.5h-18z M15 23.5h15l2 7H13z M13 32h19v3H13z M11.5 37h22v2.5h-22z',
  k: 'M21 5h3v3.5h3.5v3H24v3.5h-3V11.5h-3.5v-3H21z M14.5 17.5h16l2 7.5H12.5z M14 26.5h17l1.5 6h-20z M13 34h19v3H13z M11.5 39h22v2.5h-22z',
};

export function pieceSvg(type: PieceType, color: 'w' | 'b'): string {
  const fill = color === 'w' ? '#FAFAF7' : '#111111';
  const stroke = color === 'w' ? '#111111' : '#FAFAF7';
  return (
    `<svg viewBox="0 0 45 45" aria-hidden="true" focusable="false">` +
    `<path d="${PATHS[type]}" fill="${fill}" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round" fill-rule="evenodd"/>` +
    `</svg>`
  );
}
