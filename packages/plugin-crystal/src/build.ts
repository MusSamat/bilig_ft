/**
 * Crystal scene as named parts (content convention): `Crystal` (whole
 * crystal), `Ion_<El>_*` (one instanced mesh per ion kind, `Ion_<El>_all`),
 * `Bond_*` (instanced bonds as tubes) and `UnitCell` (translucent cell + edges).
 */
import type { Vec3 } from '@bilig/content-model';
import type { ModeState } from '@bilig/scene-core';
import type { Part } from '@bilig/scene-kit';
import { element } from '@bilig/plugin-molecule';
import { latticeBonds, latticePoints, nearestNeighbour, unitCellEdges, type CrystalParams, type Ion } from './lattice.js';

export type Rep = 'ball-stick' | 'spacefill';
export function repFrom(modes: ModeState): Rep {
  const v = modes.rep ?? modes.repr;
  return v === 'spacefill' || v === 'spaceFill' ? 'spacefill' : 'ball-stick';
}

/** Ion radius: given ionic radius, else scaled van der Waals radius. */
function ionRadius(ion: Ion, p: CrystalParams, rep: Rep): number {
  const nn = nearestNeighbour(p.lattice, p.a);
  const vdwMax = Math.max(...p.ions.map((i) => element(i.el).vdw));
  const full = ion.radius ?? (nn / 2) * (0.75 + 0.25 * (element(ion.el).vdw / vdwMax));
  return rep === 'spacefill' ? full : Math.max(nn * 0.08, full * 0.4);
}

const MAX_BONDS = 900;

export function buildCrystalParts(p: CrystalParams, modes: ModeState): Part[] {
  const rep = repFrom(modes);
  const points = latticePoints(p);
  const [nx, ny, nz] = p.cells;
  const ext: Vec3 = [nx * p.a, ny * p.a, nz * p.a];
  const pad = p.a * 0.2;
  const parts: Part[] = [
    { name: 'Crystal', shape: { kind: 'box', size: [ext[0] + pad, ext[1] + pad, ext[2] + pad] }, position: [ext[0] / 2, ext[1] / 2, ext[2] / 2], color: '#9ad1d4', opacity: 0.05, container: true },
  ];
  const counts = new Map<string, number>();
  p.ions.forEach((ion, idx) => {
    const positions = points.filter((pt) => pt.ion === idx).map((pt) => pt.pos);
    if (!positions.length) return;
    const n = (counts.get(ion.el) ?? 0) + 1;
    counts.set(ion.el, n);
    parts.push({ name: `Ion_${ion.el}_${n === 1 ? 'all' : `all${n}`}`, shape: { kind: 'instances', positions, radius: ionRadius(ion, p, rep) }, color: element(ion.el).color, concept: ion.concept, roughness: 0.3 });
  });
  if (rep === 'ball-stick') {
    const bonds = latticeBonds(points, nearestNeighbour(p.lattice, p.a)).slice(0, MAX_BONDS);
    parts.push({ name: 'Bonds', shape: { kind: 'group' }, noPick: true });
    bonds.forEach(([i, j], k) =>
      parts.push({ name: `Bond_${k + 1}`, parent: 'Bonds', shape: { kind: 'tube', from: points[i].pos, to: points[j].pos, radius: p.a * 0.025 }, color: '#c9ced6', concept: p.bondConcept }),
    );
  }
  parts.push({ name: 'UnitCell', shape: { kind: 'box', size: [p.a, p.a, p.a] }, position: [p.a / 2, p.a / 2, p.a / 2], color: '#ffd166', opacity: 0.12, container: true });
  unitCellEdges(p).forEach(([a, b], k) =>
    parts.push({ name: `UnitCell_Edge_${k + 1}`, parent: 'UnitCell', shape: { kind: 'tube', from: a, to: b, radius: p.a * 0.012 }, color: '#ffd166' }),
  );
  return parts;
}
