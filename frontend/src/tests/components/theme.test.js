// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buttonVariants, pickVariant } from '@/config/componentVariants';
import { colors, contrastPairs } from '@/config/theme';

const css = readFileSync(fileURLToPath(new URL('../../app/globals.css', import.meta.url)), 'utf8');

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('design tokens', () => {
  it('theme.js mirrors every hex colour token in globals.css exactly', () => {
    const fromCss = Object.fromEntries([...css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6});/g)].map((m) => [m[1], m[2]]));
    expect(fromCss).toEqual({ ...colors });
  });

  it.each(contrastPairs)('%s on %s meets %s:1 (WCAG AA)', (fg, bg, minimum) => {
    expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(minimum);
  });

  it('contrast helper matches known values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });
});

describe('variant validation', () => {
  it('returns the class for a documented variant', () => {
    expect(pickVariant(buttonVariants.variant, 'danger', 'primary', 'Button variant')).toContain('bg-danger');
  });

  it('throws outside production for an unknown variant, naming the allowed values', () => {
    expect(() => pickVariant(buttonVariants.variant, 'fancy', 'primary', 'Button variant')).toThrow(/Button variant: unknown value "fancy". Allowed: primary, secondary/);
  });

  it('falls back to the default variant in production', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(pickVariant(buttonVariants.variant, 'fancy', 'primary', 'Button variant')).toBe(buttonVariants.variant.primary);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
