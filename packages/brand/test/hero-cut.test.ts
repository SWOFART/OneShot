import { describe, expect, it } from 'vitest';

import { HERO_CHANNEL, HERO_RADIUS, heroClipPaths } from '../src/heroCut.js';

/** Every coordinate pair in a path string, in order. */
function points(path: string): readonly (readonly [number, number])[] {
  return [...path.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/gu)].map(
    ([, x = '0', y = '0']) => [Number(x), Number(y)] as const,
  );
}

/**
 * The x of the apex where a shape's diagonal meets the given edge.
 *
 * Both shapes have several `Q` commands landing on the same edge — the box
 * corners as well as the apex. On the panel the diagonal apex is the first
 * one; on the figure, whose path runs the other way round, it is the last.
 */
function apexAt(path: string, y: number, which: 'first' | 'last'): number {
  const matches = [...path.matchAll(new RegExp(`Q([\\d.]+) ${y} `, 'gu'))];
  const match = which === 'first' ? matches[0] : matches[matches.length - 1];
  return Number(match?.[1]);
}

const panelApex = (path: string, y: number): number => apexAt(path, y, 'first');
const figureApex = (path: string, y: number): number => apexAt(path, y, 'last');

describe('heroClipPaths', () => {
  it('places the apexes where the canvas drew them', () => {
    const { panel, figure } = heroClipPaths(1032, 268);
    // The canvas cut the panel's diagonal out of the top edge at x≈671 and into
    // the bottom edge at x≈557, with the figure's mirroring one channel away.
    expect(panelApex(panel, 0)).toBeCloseTo(670.8, 1);
    expect(panelApex(panel, 268)).toBeCloseTo(556.8, 1);
    expect(figureApex(figure, 0)).toBeCloseTo(686, 0);
    expect(figureApex(figure, 268)).toBeCloseTo(572, 0);
  });

  it('separates the shapes by exactly the channel, measured perpendicular', () => {
    const height = 268;
    const { panel, figure } = heroClipPaths(1032, height);
    const lean = (114 / 268) * height;
    const horizontal = figureApex(figure, 0) - panelApex(panel, 0);
    const perpendicular = horizontal * (height / Math.hypot(lean, height));
    expect(perpendicular).toBeCloseTo(HERO_CHANNEL, 1);
  });

  it('rounds every vertex, including the acute ones', () => {
    const { panel, figure } = heroClipPaths(1032, 268);
    // Each shape is a quadrilateral, so four rounded vertices each: the panel
    // takes the box's two LEFT corners plus its two diagonal apexes, and the
    // figure the two RIGHT corners plus its own two apexes. The diagonal is
    // what removes the other two corners from each — that is the cut.
    expect(panel.match(/Q/gu)).toHaveLength(4);
    expect(figure.match(/Q/gu)).toHaveLength(4);
  });

  it('leans further right as the box grows taller', () => {
    const short = heroClipPaths(1032, 200);
    const tall = heroClipPaths(1032, 400);
    const shortLean = panelApex(short.panel, 0) - panelApex(short.panel, 200);
    const tallLean = panelApex(tall.panel, 0) - panelApex(tall.panel, 400);
    expect(shortLean).toBeGreaterThan(0);
    expect(tallLean).toBeGreaterThan(shortLean);
  });

  it('stays inside the box at the narrowest width it is used at', () => {
    // HERO_MIN_WIDTH gates the component, so 720 is the smallest box this ever
    // has to draw. Narrower than that, the channel offset alone would push the
    // figure's apex past the right edge — which is why the component falls back
    // to a plain panel rather than this function clamping.
    const { panel, figure } = heroClipPaths(720, 268);
    for (const path of [panel, figure]) {
      for (const [x, y] of points(path)) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(720);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(268);
      }
    }
  });

  it('shrinks the corner radius on a short box', () => {
    // radius = min(HERO_RADIUS, width/4, height/4) — 60/4 = 15 wins here, so
    // the top edge's first vertex sits at x = 15 rather than 24.
    const { panel } = heroClipPaths(1032, 60);
    expect(panel.startsWith('M15 0')).toBe(true);
    expect(HERO_RADIUS).toBe(24);
  });

  it('rejects a non-positive box', () => {
    expect(() => heroClipPaths(0, 268)).toThrow(/positive/u);
    expect(() => heroClipPaths(1032, -1)).toThrow(/positive/u);
  });
});
