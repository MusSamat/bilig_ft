/**
 * Minimal TeX-to-HTML renderer for formulas and process equations
 * (`C_6H_{12}O_6 + 6O_2 \to 6CO_2`, `T = 2\pi\sqrt{L/g}`): sub/superscripts,
 * arrows and a few symbols. Content is data; no HTML is injected.
 */
import { Fragment, type ReactNode } from 'react';

const SYMBOLS: Record<string, string> = {
  to: '→', rightarrow: '→', leftarrow: '←', leftrightarrow: '↔', rightleftharpoons: '⇌', pi: 'π', alpha: 'α', beta: 'β',
  gamma: 'γ', delta: 'δ', Delta: 'Δ', theta: 'θ', lambda: 'λ', mu: 'μ', omega: 'ω', Omega: 'Ω', cdot: '·', times: '×',
  approx: '≈', le: '≤', quad: ' ', qquad: '  ', ',': ' ', left: '', right: '', mathrm: '', ldots: '…', cdots: '⋯', propto: '∝', partial: '∂', sum: 'Σ', int: '∫', nu: 'ν', eta: 'η', epsilon: 'ε', varepsilon: 'ε', xi: 'ξ', psi: 'ψ', chi: 'χ', kappa: 'κ', zeta: 'ζ', Sigma: 'Σ', Pi: 'Π', Phi: 'Φ', Lambda: 'Λ', Theta: 'Θ', Gamma: 'Γ', uparrow: '↑', downarrow: '↓', longrightarrow: '⟶', div: '÷', neq: '≠', leq: '≤', geq: '≥', sim: '∼', angle: '∠', perp: '⊥', parallel: '∥', triangle: '△', ge: '≥', ne: '≠', pm: '±', infty: '∞', degree: '°', circ: '°', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ',
};

/** Read a `{…}` group or a single char starting at i. */
function group(src: string, i: number): [string, number] {
  if (src[i] === '{') {
    let depth = 1;
    let j = i + 1;
    while (j < src.length && depth) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') depth--;
      j++;
    }
    return [src.slice(i + 1, j - 1), j];
  }
  if (src[i] === '\\') {
    const m = /^\\([A-Za-z]+)/.exec(src.slice(i));
    if (m) return [m[0], i + m[0].length];
  }
  return [src[i] ?? '', i + 1];
}

export function texToNodes(src: string, keyPrefix = 'f'): ReactNode[] {
  const out: ReactNode[] = [];
  let text = '';
  let i = 0;
  let k = 0;
  const flush = () => {
    if (text) out.push(<Fragment key={`${keyPrefix}${k++}`}>{text}</Fragment>);
    text = '';
  };
  while (i < src.length) {
    const ch = src[i];
    if (ch === '_' || ch === '^') {
      flush();
      const [g, j] = group(src, i + 1);
      const inner = texToNodes(g, `${keyPrefix}${k}-`);
      out.push(ch === '_' ? <sub key={`${keyPrefix}${k++}`}>{inner}</sub> : <sup key={`${keyPrefix}${k++}`}>{inner}</sup>);
      i = j;
    } else if (ch === '\\') {
      const m = /^\\([A-Za-z]+)/.exec(src.slice(i));
      if (m) {
        i += m[0].length;
        if (m[1] === 'sqrt') {
          flush();
          const [g, j] = group(src, i);
          out.push(<Fragment key={`${keyPrefix}${k++}`}>√({texToNodes(g, `${keyPrefix}${k}-`)})</Fragment>);
          i = j;
        } else if (m[1] === 'frac' || m[1] === 'tfrac' || m[1] === 'dfrac') {
          flush();
          const [a, j1] = group(src, i);
          const [b, j2] = group(src, j1);
          out.push(
            <span key={`${keyPrefix}${k++}`} className="frac">
              <span className="frac__num">{texToNodes(a, `${keyPrefix}${k}a`)}</span>
              <span className="frac__den">{texToNodes(b, `${keyPrefix}${k}b`)}</span>
            </span>,
          );
          i = j2;
        } else if (m[1] === 'text' || m[1] === 'mathrm') {
          const [g, j] = group(src, i);
          text += g;
          i = j;
        } else {
          text += SYMBOLS[m[1]] ?? '';
        }
      } else {
        text += src[i + 1] ?? '';
        i += 2;
      }
    } else if (ch === '{' || ch === '}') {
      i++;
    } else {
      text += ch;
      i++;
    }
  }
  flush();
  return out;
}

/** Plain-text version (for aria-labels, PPTX). */
export function texToText(src: string): string {
  const SUB: Record<string, string> = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋' };
  const SUP: Record<string, string> = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻' };
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '_' || ch === '^') {
      const [g, j] = group(src, i + 1);
      const map = ch === '_' ? SUB : SUP;
      const inner = texToText(g);
      out += [...inner].every((c) => c in map) ? [...inner].map((c) => map[c]).join('') : (ch === '_' ? '_' : '^') + inner;
      i = j;
    } else if (ch === '\\') {
      const m = /^\\([A-Za-z]+)/.exec(src.slice(i));
      if (!m) {
        out += src[i + 1] ?? '';
        i += 2;
        continue;
      }
      i += m[0].length;
      if (m[1] === 'sqrt') {
        const [g, j] = group(src, i);
        out += `√(${texToText(g)})`;
        i = j;
      } else if (m[1] === 'frac' || m[1] === 'tfrac' || m[1] === 'dfrac') {
        const [a, j1] = group(src, i);
        const [b, j2] = group(src, j1);
        const wrap = (x: string) => (/^[\w\u00b2-\u2089.]+$/.test(x) ? x : `(${x})`);
        out += `${wrap(texToText(a))}⁄${wrap(texToText(b))}`;
        i = j2;
      } else if (m[1] === 'text' || m[1] === 'mathrm') {
        const [g, j] = group(src, i);
        out += g;
        i = j;
      } else out += SYMBOLS[m[1]] ?? '';
    } else if (ch === '{' || ch === '}') i++;
    else {
      out += ch;
      i++;
    }
  }
  return out;
}

export function Formula({ tex, className }: { tex: string; className?: string }): JSX.Element {
  return (
    <span className={className ? `formula-text ${className}` : 'formula-text'} role="math" aria-label={texToText(tex)}>
      <span aria-hidden="true">{texToNodes(tex)}</span>
    </span>
  );
}
