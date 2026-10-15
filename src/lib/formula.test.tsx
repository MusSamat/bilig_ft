import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Formula, texToText } from './formula';

describe('formula rendering', () => {
  it('renders sub/superscripts and arrows as text', () => {
    expect(texToText('C_6H_{12}O_6 + 6O_2 \\to 6CO_2 + 6H_2O')).toBe('C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O');
    expect(texToText('T = 2\\pi\\sqrt{L/g}')).toBe('T = 2π√(L/g)');
    expect(texToText('V = a^3')).toBe('V = a³');
    expect(texToText('^{23}_{11}Na')).toBe('²³₁₁Na');
    expect(texToText('V = \\tfrac{1}{3}Sh')).toBe('V = 1⁄3Sh');
    expect(texToText('F = m \\cdot a')).toBe('F = m · a');
  });
  it('renders fractions as elements, never raw markup', () => {
    const { container } = render(<Formula tex={"V = \\tfrac{1}{3}Sh"} />);
    expect(container.querySelector('.frac__num')?.textContent).toBe('1');
    expect(container.querySelector('.frac__den')?.textContent).toBe('3');
    expect(container.textContent).not.toMatch(/[\\{}]/);
  });
  it('renders <sub> elements with an accessible label', () => {
    const { container } = render(<Formula tex="H_2O" />);
    expect(container.querySelector('sub')?.textContent).toBe('2');
    expect(container.firstElementChild?.getAttribute('aria-label')).toBe('H₂O');
  });
});
