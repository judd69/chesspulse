// ChessPulse — ECO mini-table (feature 13 fallback).
// The live Opening Explorer is blocked from this sandbox (401), so the
// opening name comes from this small reference table of common openings,
// matched against the puzzle game's opening moves. Labelled honestly on the
// page as "from a reference table of common openings", never as live data.
// Each entry: first moves in SAN (from the start position), name, ECO code.

export interface EcoEntry {
  moves: string[];
  name: string;
  eco: string;
}

export const ECO_TABLE: EcoEntry[] = [
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], eco: 'C60', name: 'Ruy Lopez' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], eco: 'C50', name: 'Italian Game' },
  { moves: ['e4', 'e5', 'Nf3', 'd6'], eco: 'C41', name: "Philidor's Defence" },
  { moves: ['e4', 'e5', 'Nf3', 'Nf6'], eco: 'C42', name: "Petrov's Defence" },
  { moves: ['e4', 'e5', 'Bc4'], eco: 'C24', name: "Bishop's Opening" },
  { moves: ['e4', 'e5', 'd4'], eco: 'C44', name: "King's Gambit Declined / Centre Game" },
  { moves: ['e4', 'c5'], eco: 'B20', name: 'Sicilian Defence' },
  { moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'], eco: 'B90', name: 'Sicilian Defence, Najdorf Variation' },
  { moves: ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'e5'], eco: 'B33', name: 'Sicilian Defence, Sveshnikov Variation' },
  { moves: ['e4', 'c5', 'c3'], eco: 'B22', name: 'Sicilian Defence, Alapin Variation' },
  { moves: ['e4', 'e6'], eco: 'C00', name: 'French Defence' },
  { moves: ['e4', 'e6', 'd4', 'd5', 'Nc3'], eco: 'C11', name: 'French Defence, Classical' },
  { moves: ['e4', 'e6', 'd4', 'd5', 'e5'], eco: 'C02', name: 'French Defence, Advance Variation' },
  { moves: ['e4', 'c6'], eco: 'B12', name: 'Caro-Kann Defence' },
  { moves: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5'], eco: 'B10', name: 'Caro-Kann Defence, Classical Variation' },
  { moves: ['e4', 'd5'], eco: 'B01', name: 'Scandinavian Defence' },
  { moves: ['e4', 'd6'], eco: 'B07', name: 'Pirc Defence' },
  { moves: ['e4', 'g6'], eco: 'B06', name: 'Modern Defence' },
  { moves: ['e4', 'Nf6'], eco: 'B02', name: "Alekhine's Defence" },
  { moves: ['d4', 'd5'], eco: 'D06', name: "Queen's Gambit Declined" },
  { moves: ['d4', 'd5', 'c4'], eco: 'D06', name: "Queen's Gambit" },
  { moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6'], eco: 'D37', name: "Queen's Gambit Declined" },
  { moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'], eco: 'E40', name: 'Nimzo-Indian Defence' },
  { moves: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6'], eco: 'E06', name: "Queen's Indian Defence" },
  { moves: ['d4', 'Nf6', 'c4', 'g6'], eco: 'E60', name: "King's Indian Defence" },
  { moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6'], eco: 'E90', name: "King's Indian Defence, Classical" },
  { moves: ['d4', 'f5'], eco: 'A80', name: 'Dutch Defence' },
  { moves: ['d4', 'g6'], eco: 'A40', name: 'Modern Defence vs 1.d4' },
  { moves: ['c4'], eco: 'A10', name: 'English Opening' },
  { moves: ['c4', 'e5'], eco: 'A20', name: 'English Opening, Reversed Sicilian' },
  { moves: ['Nf3', 'd5'], eco: 'A06', name: 'Réti Opening' },
  { moves: ['Nf3', 'Nf6', 'g3'], eco: 'A07', name: "King's Indian Attack" },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4'], eco: 'C44', name: 'Scotch Game' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4', 'Nf6'], eco: 'C45', name: 'Scotch Game, Classical' },
  { moves: ['e4', 'e5', 'f4'], eco: 'C30', name: "King's Gambit" },
  { moves: ['e4', 'c5', 'Nf3', 'e6'], eco: 'B40', name: 'Sicilian Defence, French Variation' },
  { moves: ['d4', 'd5', 'c4', 'dxc4'], eco: 'D20', name: "Queen's Gambit Accepted" },
  { moves: ['d4', 'Nf6', 'c4', 'c5'], eco: 'A31', name: 'Benoni Defence' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'], eco: 'C78', name: 'Ruy Lopez, Closed' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6'], eco: 'C60', name: 'Ruy Lopez, Berlin Defence' },
];

/** Longest table entry that is a prefix of the game's SAN moves. */
export function lookupOpening(sans: string[]): EcoEntry | null {
  let best: EcoEntry | null = null;
  for (const entry of ECO_TABLE) {
    if (entry.moves.length > sans.length) continue;
    let ok = true;
    for (let i = 0; i < entry.moves.length; i++) {
      if (sans[i] !== entry.moves[i]) {
        ok = false;
        break;
      }
    }
    if (ok && (!best || entry.moves.length > best.moves.length)) best = entry;
  }
  return best;
}
