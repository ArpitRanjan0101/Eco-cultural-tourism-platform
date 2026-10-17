import axe from 'axe-core';
import { expect } from 'vitest';

/**
 * Runs axe-core on a rendered container and fails with the rule ids and targets of any violation.
 * Colour contrast cannot be computed in jsdom; it is covered by theme.test.js and the e2e axe scan.
 */
export async function expectNoAxeViolations(container) {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
  const summary = results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`);
  expect(summary).toEqual([]);
}
