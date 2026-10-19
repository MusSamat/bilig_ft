import { describe, it, expect } from 'vitest';
import { textLayout } from './TextPart.js';

describe('text parts', () => {
  const measure = (l: string) => l.length * 0.5;
  it('plane size from the widest line and the line count; anchor by alignment', () => {
    const c = textLayout({ kind: 'text', text: 'ab\nabcd', size: 0.2 }, measure);
    expect(c.lines).toEqual(['ab', 'abcd']);
    expect(c.width).toBeCloseTo((2 + 0.64) * 0.2, 9);
    expect(c.height).toBeGreaterThan(2 * 0.2);
    expect(c.offsetX).toBe(0);
    expect(textLayout({ kind: 'text', text: 'abcd', size: 0.2, align: 'left' }, measure).offsetX).toBeGreaterThan(0);
    expect(textLayout({ kind: 'text', text: 'abcd', size: 0.2, align: 'right' }, measure).offsetX).toBeLessThan(0);
  });
});
