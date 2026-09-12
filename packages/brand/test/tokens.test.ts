import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Static contrast audit for the brand palette.
 *
 * jsdom cannot compute rendered colours, so the component suites disable axe's
 * colour-contrast rule. This reads the tokens straight from the stylesheet and
 * computes WCAG ratios instead, in both themes, so a palette edit that dims a
 * colour below AA fails here rather than shipping.
 */

const packageRoot = process.cwd().endsWith('brand')
  ? process.cwd()
  : join(process.cwd(), 'packages', 'brand');

const AA_NORMAL_TEXT = 4.5;

function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  const [r = 0, g = 0, b = 0] = [0, 2, 4]
    .map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const [lighter, darker] = first > second ? [first, second] : [second, first];
  return (lighter + 0.05) / (darker + 0.05);
}

async function readTokensCss(): Promise<string> {
  return readFile(join(packageRoot, 'src', 'tokens.css'), 'utf8');
}

/** Reads the `--os-*` hex tokens out of one selector's block. */
function readTheme(css: string, selector: string): Readonly<Record<string, string>> {
  const block = new RegExp(`${selector}\\s*\\{([^}]*)\\}`, 'u').exec(css)?.[1];
  if (block === undefined) throw new Error(`missing block for ${selector}`);
  const tokens: Record<string, string> = {};
  for (const match of block.matchAll(/--os-([a-z-]+):\s*(#[0-9a-f]{6})/giu)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) tokens[name] = value.toLowerCase();
  }
  return tokens;
}

/**
 * Every ink/surface pair the design actually renders. Signal green is a fill,
 * never body text on the page ground, so it is audited only where text sits on
 * it and where it sits on the panel. The signal pill and the lime field are
 * the same colour in both themes and carry their own fixed inks, so they are
 * audited against those rather than against the theme's `--os-ink`.
 */
const AUDITED_PAIRS: readonly (readonly [ink: string, surface: string])[] = [
  ['accent-ink', 'ground'],
  ['accent-ink', 'surface'],
  ['ink', 'ground'],
  ['ink-muted', 'ground'],
  ['ink', 'surface'],
  ['ink-muted', 'surface'],
  ['panel-ink', 'panel'],
  ['panel-ink-muted', 'panel'],
  ['signal', 'panel'],
  ['on-signal', 'signal'],
  ['on-field', 'field'],
];

describe('brand palette', () => {
  it('computes known ratios correctly', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1);
    expect(contrastRatio('#000000', '#000000')).toBeCloseTo(1, 5);
  });

  it('defines every token both themes need', async () => {
    const css = await readTokensCss();
    const light = readTheme(css, ':root');
    const dark = { ...light, ...readTheme(css, ":root\\[data-theme='dark'\\]") };
    for (const [themeName, tokens] of [
      ['light', light],
      ['dark', dark],
    ] as const) {
      for (const name of [
        'ground',
        'surface',
        'panel',
        'panel-ink',
        'panel-ink-muted',
        'field',
        'signal',
        'on-signal',
        'on-field',
        'attempt',
        'ink',
        'ink-muted',
      ]) {
        expect(tokens[name], `${themeName} is missing --os-${name}`).toBeDefined();
      }
    }
  });

  it('meets WCAG AA for normal text in both themes', async () => {
    const css = await readTokensCss();
    const light = readTheme(css, ':root');
    const dark = { ...light, ...readTheme(css, ":root\\[data-theme='dark'\\]") };

    const failures: string[] = [];
    for (const [themeName, tokens] of [
      ['light', light],
      ['dark', dark],
    ] as const) {
      for (const [ink, surface] of AUDITED_PAIRS) {
        const foreground = tokens[ink];
        const background = tokens[surface];
        if (foreground === undefined || background === undefined) continue;
        const ratio = contrastRatio(foreground, background);
        if (ratio < AA_NORMAL_TEXT) {
          failures.push(`${themeName}: --os-${ink} on --os-${surface} is ${ratio.toFixed(2)}:1`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
