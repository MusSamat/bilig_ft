/**
 * Element table H–Kr: atomic number, CPK/Jmol colour, covalent and van der
 * Waals radii (Å). Used by the molecule and crystal plugins (TZ W-23, W-25).
 */
export interface ElementInfo {
  symbol: string;
  z: number;
  color: string;
  /** Covalent radius, Å. */
  covalent: number;
  /** Van der Waals radius, Å. */
  vdw: number;
}

// [symbol, CPK colour, covalent Å, vdW Å] in Z order.
const RAW: [string, string, number, number][] = [
  ['H', '#f1f4f7', 0.31, 1.2],
  ['He', '#d9ffff', 0.28, 1.4],
  ['Li', '#cc80ff', 1.28, 1.82],
  ['Be', '#c2ff00', 0.96, 1.53],
  ['B', '#ffb5b5', 0.84, 1.92],
  ['C', '#4a5163', 0.76, 1.7],
  ['N', '#3050f8', 0.71, 1.55],
  ['O', '#e8553d', 0.66, 1.52],
  ['F', '#90e050', 0.57, 1.47],
  ['Ne', '#b3e3f5', 0.58, 1.54],
  ['Na', '#a36be0', 1.66, 2.27],
  ['Mg', '#8aff00', 1.41, 1.73],
  ['Al', '#bfa6a6', 1.21, 1.84],
  ['Si', '#f0c8a0', 1.11, 2.1],
  ['P', '#ff8000', 1.07, 1.8],
  ['S', '#ffff30', 1.05, 1.8],
  ['Cl', '#5bc06a', 1.02, 1.75],
  ['Ar', '#80d1e3', 1.06, 1.88],
  ['K', '#8f40d4', 2.03, 2.75],
  ['Ca', '#3dff00', 1.76, 2.31],
  ['Sc', '#e6e6e6', 1.7, 2.11],
  ['Ti', '#bfc2c7', 1.6, 2.0],
  ['V', '#a6a6ab', 1.53, 2.0],
  ['Cr', '#8a99c7', 1.39, 2.0],
  ['Mn', '#9c7ac7', 1.39, 2.0],
  ['Fe', '#e06633', 1.32, 2.0],
  ['Co', '#f090a0', 1.26, 2.0],
  ['Ni', '#50d050', 1.24, 1.63],
  ['Cu', '#c88033', 1.32, 1.4],
  ['Zn', '#7d80b0', 1.22, 1.39],
  ['Ga', '#c28f8f', 1.22, 1.87],
  ['Ge', '#668f8f', 1.2, 2.11],
  ['As', '#bd80e3', 1.19, 1.85],
  ['Se', '#ffa100', 1.2, 1.9],
  ['Br', '#a62929', 1.2, 1.85],
  ['Kr', '#5cb8d1', 1.16, 2.02],
];

export const ELEMENTS: Readonly<Record<string, ElementInfo>> = Object.freeze(
  Object.fromEntries(RAW.map(([symbol, color, covalent, vdw], i) => [symbol, { symbol, z: i + 1, color, covalent, vdw }])),
);

const UNKNOWN: ElementInfo = { symbol: '?', z: 0, color: '#ff1493', covalent: 0.8, vdw: 1.7 };

/** Look up an element by symbol (case-insensitive first letter); unknown → magenta placeholder. */
export function element(symbol: string): ElementInfo {
  const norm = symbol.charAt(0).toUpperCase() + symbol.slice(1).toLowerCase();
  return ELEMENTS[norm] ?? { ...UNKNOWN, symbol };
}

/** Shell capacities used for the simple Bohr filling (2, 8, 8, 18, 18, 32). */
export const SHELL_CAPACITY = [2, 8, 8, 18, 18, 32] as const;

/**
 * Electrons per shell for atomic number Z, simple Bohr filling (school model):
 * 2, 8, 8, 18… — e.g. Na (11) → [2, 8, 1], K (19) → [2, 8, 8, 1].
 */
export function shellConfig(z: number): number[] {
  let left = Math.max(0, Math.floor(z));
  const out: number[] = [];
  for (const cap of SHELL_CAPACITY) {
    if (left <= 0) break;
    const n = Math.min(cap, left);
    out.push(n);
    left -= n;
  }
  return out;
}
