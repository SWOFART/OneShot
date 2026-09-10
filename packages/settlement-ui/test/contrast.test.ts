import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Static contrast audit for the slice palette.
 *
 * The component tests disable axe's `color-contrast` rule because jsdom cannot
 * compute rendered colours, which left the contrast claim unproven. This reads
 * the tokens straight from the stylesheet and computes WCAG ratios, so a future
 * palette edit that dims a colour below AA fails here instead of shipping.
 */

const packageRoot = process.cwd().endsWith('settlement-ui')
  ? process.cwd()
  : join(process.cwd(), 'packages', 'settlement-ui');

const AA_NORMAL_TEXT = 4.5;

function channels(hex: string): readonly number[] {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
}

function relativeLuminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = channels(hex).map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const [lighter, darker] = first > second ? [first, second] : [second, first];
  return (lighter + 0.05) / (darker + 0.05);
}

async function readCss(): Promise<string> {
  return readFile(join(packageRoot, 'src', 'styles.css'), 'utf8');
}

async function readBrandCss(): Promise<string> {
  return readFile(join(packageRoot, '..', 'brand', 'src', 'tokens.css'), 'utf8');
}

/**
 * Resolves a declaration value to a literal hex.
 *
 * The slice palette is expressed in `--os-*` brand tokens now, so a value may
 * be a `var()` reference, possibly nested. Follow the chain into the brand
 * stylesheet, preferring the dark theme — the default the console ships with.
 */
function resolveColour(value: string, brandCss: string, depth = 0): string | undefined {
  if (depth > 4) return undefined;
  const literal = /^#[0-9a-f]{6}$/iu.exec(value.trim())?.[0];
  if (literal !== undefined) return literal.toLowerCase();

  const reference = /var\(\s*(--[a-z0-9-]+)/iu.exec(value)?.[1];
  if (reference === undefined) return undefined;

  const dark = /:root\[data-theme='dark'\]\s*\{([^}]*)\}/u.exec(brandCss)?.[1];
  const light = /:root\s*\{([^}]*)\}/u.exec(brandCss)?.[1];
  for (const block of [dark, light]) {
    if (block === undefined) continue;
    const found = new RegExp(`${reference}:\\s*([^;]+);`, 'u').exec(block)?.[1];
    if (found !== undefined) return resolveColour(found, brandCss, depth + 1);
  }
  return undefined;
}

function readTokens(css: string): Readonly<Record<string, string>> {
  const tokens: Record<string, string> = {};
  for (const match of css.matchAll(/--([a-z-]+):\s*([^;]+);/giu)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) tokens[name] = value.trim();
  }
  return tokens;
}

/**
 * Reads a literal colour out of a rule block.
 *
 * The surfaces are read from the stylesheet rather than restated here: a test
 * that hardcodes the background it audits stops testing the moment someone
 * lightens the page.
 */
function readDeclaration(css: string, selector: string, property: string): string | undefined {
  const block = new RegExp(`${selector}\\s*\\{([^}]*)\\}`, 'u').exec(css)?.[1];
  if (block === undefined) return undefined;
  return new RegExp(`(?:^|;|\\n)\\s*${property}:\\s*([^;]+);`, 'iu').exec(block)?.[1]?.trim();
}

describe('palette contrast', () => {
  it('exposes every colour token the slice renders with', async () => {
    const tokens = readTokens(await readCss());
    for (const name of ['ink', 'muted', 'green', 'amber', 'red', 'cyan', 'panel']) {
      expect(tokens[name], `missing --${name}`).toBeDefined();
    }
  });

  it('meets WCAG AA for normal text on both surfaces', async () => {
    const css = await readCss();
    const brand = await readBrandCss();
    const tokens = readTokens(css);
    const panel = resolveColour(tokens['panel'] ?? '', brand);
    const page = resolveColour(
      readDeclaration(css, '\\.settlement-details,\\s*\\.route-state', 'background') ?? '',
      brand,
    );
    expect(panel, 'missing --panel token').toBeDefined();
    expect(page, 'page background is no longer a literal in the base rule').toBeDefined();
    if (panel === undefined || page === undefined) return;

    const failures: string[] = [];
    for (const name of ['ink', 'muted', 'green', 'amber', 'red', 'cyan']) {
      const colour = resolveColour(tokens[name] ?? '', brand);
      if (colour === undefined) continue;
      for (const [surfaceName, surface] of [
        ['panel', panel],
        ['page', page],
      ] as const) {
        const ratio = contrastRatio(colour, surface);
        if (ratio < AA_NORMAL_TEXT) {
          failures.push(`--${name} on ${surfaceName}: ${ratio.toFixed(2)}:1`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('routes every text colour through an audited surface', async () => {
    const css = await readCss();
    const brand = await readBrandCss();
    const tokens = readTokens(css);
    const ink = resolveColour(tokens['ink'] ?? '', brand);
    expect(ink).toBeDefined();
    if (ink === undefined) return;

    // Surfaces that carry text but are literals rather than tokens. Each one is
    // audited explicitly so a new panel colour cannot slip in under AA.
    const noteBackground = resolveColour(
      readDeclaration(css, '\\.panel-note', 'background') ?? '',
      brand,
    );
    expect(noteBackground, 'panel note background missing').toBeDefined();
    if (noteBackground !== undefined) {
      expect(contrastRatio(ink, noteBackground)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }

    const selectBackground = resolveColour(
      readDeclaration(css, '\\.demo-scenarios select', 'background') ?? '',
      brand,
    );
    const selectColour = resolveColour(
      readDeclaration(css, '\\.demo-scenarios select', 'color') ?? '',
      brand,
    );
    expect(selectBackground, 'scenario select background missing').toBeDefined();
    expect(selectColour, 'scenario select colour missing').toBeDefined();
    if (selectBackground !== undefined && selectColour !== undefined) {
      expect(contrastRatio(selectColour, selectBackground)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });

  it('meets WCAG AA for the fixture-viewer banner', async () => {
    const css = await readCss();
    const brand = await readBrandCss();
    const foreground = resolveColour(readDeclaration(css, '\\.demo-bar', 'color') ?? '', brand);
    const background = resolveColour(
      readDeclaration(css, '\\.demo-bar', 'background') ?? '',
      brand,
    );
    expect(foreground, 'demo bar colour missing').toBeDefined();
    expect(background, 'demo bar background missing').toBeDefined();
    if (foreground === undefined || background === undefined) return;
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('computes known ratios correctly', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1);
    expect(contrastRatio('#000000', '#000000')).toBeCloseTo(1, 5);
  });
});
