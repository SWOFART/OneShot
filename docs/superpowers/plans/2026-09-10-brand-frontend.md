# Brand Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the settled OneShot brand — commit-ring mark, forest and signal-green palette, Rubik 300, diagonal hero cut — into the shipping frontend, and replace Privy's oversized wallet list with a searchable picker.

**Architecture:** A new source-only workspace package `@oneshot/brand` owns the palette, the mark, and the hero geometry. All three existing stylesheets stop holding hexes and read `--os-*` tokens from it. Light and dark boards are the same tokens under `:root` and `:root[data-theme='dark']`, stamped pre-paint. The wallet picker replaces Privy's modal for detected wallets using the SDK's headless SIWE flow, keeping Privy's modal as a fallback.

**Tech Stack:** React 19.2.8, TypeScript 6.0.3, Vite 8, Vitest 5 + jsdom, Testing Library, `@privy-io/react-auth` 3.6.1, pnpm 11 workspaces.

**Spec:** `docs/superpowers/specs/2026-09-10-brand-frontend-design.md`

## Global Constraints

- Branch `milestone/brand-frontend`, based on `develop` at `95709a8`. Never commit to `develop` or `main`.
- Every brand hex appears in exactly one file: `packages/brand/src/tokens.css`. No other stylesheet may introduce a literal colour.
- Palette values, copied verbatim from the canvas: panel `#0b332c`, signal green `#00dc5f`, pale lime field `#e9ffbd`, muted attempt `#4a7a60`, dark-theme ground `#0a0a0a`, light-theme ground `#f7f9f4`, panel ink `#eef7e6`, muted panel ink `#a9c4b2`, light muted ink `#3f5c46`, on-signal ink `#06231c`.
- Type is Rubik for primary, Noto Sans for secondary. **Everything is weight 300**, wordmark included.
- Hierarchy in the mark is carried by stroke weight, never opacity.
- The diagonal cut appears **once per view, on the hero only**. Every other surface is a plain rounded rectangle.
- `packages/settlement-ui` and `packages/recovery-ui` are read-only slices. `packages/settlement-ui/test/component.test.ts` asserts `button, a, input` inside them count zero — never add an interactive element to either.
- Money, network, API, worker, and domain code are out of scope. `IntentStatusView`'s data flow does not change.
- Never log signatures, addresses, SIWE messages, tokens, or wallet credentials.
- TypeScript is strict with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, and `verbatimModuleSyntax`. Relative imports inside packages carry a `.js` extension; type-only imports use `import type`.

---

### Task 1: Brand package with the palette and its contrast audit

**Files:**

- Create: `packages/brand/package.json`
- Create: `packages/brand/tsconfig.json`
- Create: `packages/brand/vitest.config.ts`
- Create: `packages/brand/src/tokens.css`
- Create: `packages/brand/src/fonts.css`
- Create: `packages/brand/src/index.ts`
- Create: `packages/brand/README.md`
- Test: `packages/brand/test/tokens.test.ts`
- Modify: `tsconfig.json` (add the project reference)

**Interfaces:**

- Consumes: nothing.
- Produces: the CSS custom properties every later task uses — `--os-ground`, `--os-surface`, `--os-panel`, `--os-panel-ink`, `--os-panel-ink-muted`, `--os-field`, `--os-signal`, `--os-on-signal`, `--os-attempt`, `--os-ink`, `--os-ink-muted`, `--os-line`, `--os-line-strong`, `--os-state-committed`, `--os-state-unknown`, `--os-state-failed`, `--os-radius`, `--os-radius-lg`, `--os-font-primary`, `--os-font-secondary`, `--os-font-mono`. Also the import specifiers `@oneshot/brand/tokens.css` and `@oneshot/brand/fonts.css`.

- [ ] **Step 1: Create the package manifest and configs**

`packages/brand/package.json`:

```json
{
  "name": "@oneshot/brand",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "OneShot brand tokens, commit-ring mark, and hero geometry.",
  "exports": {
    ".": {
      "types": "./dist/src/index.d.ts",
      "import": "./dist/src/index.js"
    },
    "./tokens.css": "./src/tokens.css",
    "./fonts.css": "./src/fonts.css"
  },
  "sideEffects": [
    "**/*.css"
  ],
  "files": [
    "dist",
    "src/tokens.css",
    "src/fonts.css",
    "README.md"
  ],
  "scripts": {
    "build": "tsc -b",
    "clean": "tsc -b --clean",
    "format": "prettier --check --ignore-path ../../.prettierignore \"**/*.{ts,tsx,json,css,md}\"",
    "format:write": "prettier --write --ignore-path ../../.prettierignore \"**/*.{ts,tsx,json,css,md}\"",
    "lint": "eslint src test",
    "test": "vitest run",
    "typecheck": "tsc -b --pretty false",
    "verify": "pnpm run format && pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build"
  },
  "dependencies": {
    "react": "19.2.8"
  },
  "devDependencies": {
    "@testing-library/react": "16.3.3",
    "@types/node": "24.13.3",
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.7",
    "jsdom": "30.0.1",
    "react-dom": "19.2.8",
    "typescript": "6.0.3",
    "vitest": "5.0.0"
  }
}
```

`packages/brand/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "outDir": "dist",
    "rootDir": ".",
    "tsBuildInfoFile": "dist/.tsbuildinfo",
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "test/**/*.ts", "test/**/*.tsx"]
}
```

`packages/brand/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
});
```

Add to `tsconfig.json` at the repository root, as the **first** entry in
`references` — it depends on nothing, and everything else will depend on it:

```json
    {
      "path": "./packages/brand"
    },
```

- [ ] **Step 2: Write the failing contrast audit**

`packages/brand/test/tokens.test.ts`:

```ts
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
 * it and where it sits on the panel.
 */
const AUDITED_PAIRS: readonly (readonly [ink: string, surface: string])[] = [
  ['ink', 'ground'],
  ['ink-muted', 'ground'],
  ['ink', 'surface'],
  ['ink-muted', 'surface'],
  ['panel-ink', 'panel'],
  ['panel-ink-muted', 'panel'],
  ['signal', 'panel'],
  ['on-signal', 'signal'],
  ['ink', 'field'],
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @oneshot/brand test`
Expected: FAIL — `ENOENT` on `src/tokens.css`.

- [ ] **Step 4: Write the token stylesheet**

`packages/brand/src/tokens.css`:

```css
/**
 * OneShot brand tokens.
 *
 * The single source of truth for the product's palette. Every value is sampled
 * from the design canvas, not invented. Nothing else in the repository may
 * introduce a literal colour: apps/web and both UI slices read these tokens.
 *
 * Hierarchy in the mark is carried by stroke weight, never opacity, so the
 * one-ink cut of the logo is the same mark.
 *
 * Dark is the default theme. `data-theme` is stamped on <html> before first
 * paint by the guard in apps/web/index.html.
 */

:root {
  color-scheme: light;

  /* surfaces */
  --os-ground: #f7f9f4;
  --os-surface: #ffffff;
  --os-panel: #0b332c;
  --os-field: #e9ffbd;

  /* ink */
  --os-ink: #0b332c;
  --os-ink-muted: #3f5c46;
  --os-panel-ink: #eef7e6;
  --os-panel-ink-muted: #a9c4b2;

  /* brand */
  --os-signal: #00dc5f;
  --os-on-signal: #06231c;
  --os-attempt: #4a7a60;

  /* lines */
  --os-line: rgba(11, 51, 44, 0.14);
  --os-line-strong: #7fa070;

  /* ledger state — committed is the signal itself; the other two are the only
   * hues outside the brand palette, kept because an operator must tell a
   * blocked intent from a settled one at a glance. */
  --os-state-committed: #00dc5f;
  --os-state-unknown: #ffc65c;
  --os-state-failed: #ff9a9a;

  /* geometry */
  --os-radius: 16px;
  --os-radius-lg: 22px;

  /* type — everything is weight 300, wordmark included */
  --os-font-primary: Rubik, 'Helvetica Neue', Helvetica, Arial, sans-serif;
  --os-font-secondary: 'Noto Sans', 'Helvetica Neue', Arial, sans-serif;
  --os-font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
}

/**
 * Dark theme. The canvas's own dark board: the same composition with the page
 * surface swapped to near-black and the ink flipped light. Panel, field, and
 * signal are unchanged — they already read correctly on black.
 */
:root[data-theme='dark'] {
  color-scheme: dark;

  --os-ground: #0a0a0a;
  --os-surface: #12211c;

  --os-ink: #eef7e6;
  --os-ink-muted: #a9c4b2;

  --os-line: rgba(238, 247, 230, 0.12);
  --os-line-strong: #3f7059;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @oneshot/brand test`
Expected: PASS, 3 tests.

- [ ] **Step 6: Add the font stylesheet, the entry point, and the README**

`packages/brand/src/fonts.css`:

```css
/**
 * Rubik primary, Noto Sans secondary — the pairing the brand direction was
 * chosen on. Weight 300 is the floor Google Fonts offers for Rubik and is what
 * the whole product uses; 400 is loaded only for the rare bolder run of text.
 */
@import url('https://fonts.googleapis.com/css2?family=Rubik:wght@300;400&family=Noto+Sans:wght@300;400&display=swap');
```

`packages/brand/src/index.ts`:

```ts
export {};
```

`packages/brand/README.md`:

```markdown
# @oneshot/brand

Brand tokens, the commit-ring mark, and the hero geometry.

`src/tokens.css` is the only file in the repository that holds a brand colour.
`apps/web`, `@oneshot/settlement-ui`, and `@oneshot/recovery-ui` all read the
`--os-*` custom properties it defines. The audit in `test/tokens.test.ts`
computes WCAG ratios over both themes, so a palette edit that drops below AA
fails in CI rather than in review.

The diagonal hero cut is derived by `heroClipPaths` and belongs to the hero
only. Every other surface in the product is a plain rounded rectangle.
```

- [ ] **Step 7: Install, then verify the package end to end**

Run: `pnpm install`
Run: `pnpm --filter @oneshot/brand verify`
Expected: format, lint, typecheck, test, and build all pass.

- [ ] **Step 8: Commit**

```bash
git add packages/brand tsconfig.json pnpm-lock.yaml
git commit -m "feat(brand): add the brand token package with a two-theme contrast audit"
```

---

### Task 2: The commit-ring mark

**Files:**

- Create: `packages/brand/src/CommitRing.tsx`
- Modify: `packages/brand/src/index.ts`
- Test: `packages/brand/test/commit-ring.test.tsx`

**Interfaces:**

- Consumes: `--os-panel`, `--os-signal`, `--os-attempt` from Task 1.
- Produces: `CommitRing`, a React component with props `{ size?: number; title?: string; className?: string }`, default `size` 32. Exported from `@oneshot/brand` along with `type CommitRingProps`.

- [ ] **Step 1: Write the failing test**

`packages/brand/test/commit-ring.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CommitRing } from '../src/CommitRing.js';

describe('CommitRing', () => {
  it('draws three attempt arcs and one committed arc at full size', () => {
    const { container } = render(<CommitRing size={64} />);
    expect(container.querySelectorAll('path[data-arc="attempt"]')).toHaveLength(3);
    expect(container.querySelectorAll('path[data-arc="committed"]')).toHaveLength(1);
  });

  it('carries hierarchy in stroke weight, not opacity', () => {
    const { container } = render(<CommitRing size={64} />);
    const attempt = container.querySelector('path[data-arc="attempt"]');
    const committed = container.querySelector('path[data-arc="committed"]');
    expect(attempt?.getAttribute('stroke-width')).toBe('4.6');
    expect(committed?.getAttribute('stroke-width')).toBe('6.4');
    for (const node of container.querySelectorAll('path, circle, rect')) {
      expect(node.getAttribute('opacity')).toBeNull();
    }
  });

  it('drops the attempt arcs and thickens the committed arc below 32px', () => {
    const { container } = render(<CommitRing size={24} />);
    expect(container.querySelectorAll('path[data-arc="attempt"]')).toHaveLength(0);
    expect(
      container.querySelector('path[data-arc="committed"]')?.getAttribute('stroke-width'),
    ).toBe('7.4');
    expect(container.querySelector('circle')?.getAttribute('r')).toBe('6.4');
  });

  it('is decorative unless given a title', () => {
    const { container, rerender } = render(<CommitRing size={32} />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');

    rerender(<CommitRing size={32} title="OneShot" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBeNull();
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.querySelector('title')?.textContent).toBe('OneShot');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oneshot/brand test commit-ring`
Expected: FAIL — cannot resolve `../src/CommitRing.js`.

- [ ] **Step 3: Write the component**

`packages/brand/src/CommitRing.tsx`:

```tsx
/**
 * The OneShot mark: a squircle tile holding a ring of attempts, one of which
 * committed.
 *
 * Three short arcs are open attempts; the single long arc is the committed
 * settlement, ending in a filled node. Hierarchy is carried by stroke weight,
 * never by opacity, so the one-ink cut is the same mark.
 *
 * Below 32px the attempt dashes stop resolving, so the reduced cut drops them
 * and thickens what remains. Coordinates are the canvas's own: a 64 viewBox,
 * tile radius 19, glyph inset 10, ring centred at (32,32) with r 15.5. The
 * glyph group scales the 64-unit ring into that 44-unit inset window.
 */

const REDUCED_CUT_BELOW = 32;

export interface CommitRingProps {
  /** Rendered edge length in pixels. Defaults to 32. */
  readonly size?: number;
  /** Accessible name. Omit to render the mark as decoration. */
  readonly title?: string;
  readonly className?: string;
}

const ATTEMPT_ARCS: readonly string[] = [
  'M45.93 25.20 A15.5 15.5 0 0 1 47.38 33.89',
  'M45.29 39.98 A15.5 15.5 0 0 1 38.79 45.93',
  'M32.54 47.49 A15.5 15.5 0 0 1 24.02 45.29',
];

const COMMITTED_ARC = 'M19.30 40.89 A15.5 15.5 0 0 1 41.96 20.13';

export function CommitRing({ size = 32, title, className }: CommitRingProps) {
  const reduced = size < REDUCED_CUT_BELOW;
  const labelled = title !== undefined;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      {...(labelled ? { role: 'img' } : { 'aria-hidden': true })}
    >
      {labelled && <title>{title}</title>}
      <rect x="0" y="0" width="64" height="64" rx="19" fill="var(--os-tile, var(--os-panel))" />
      <g transform="translate(10 10) scale(0.6875)">
        {!reduced &&
          ATTEMPT_ARCS.map((d) => (
            <path
              key={d}
              d={d}
              data-arc="attempt"
              fill="none"
              stroke="var(--os-attempt)"
              strokeWidth="4.6"
              strokeLinecap="round"
            />
          ))}
        <path
          d={COMMITTED_ARC}
          data-arc="committed"
          fill="none"
          stroke="var(--os-mark-signal, var(--os-signal))"
          strokeWidth={reduced ? '7.4' : '6.4'}
          strokeLinecap="round"
        />
        <circle
          cx="41.96"
          cy="20.13"
          r={reduced ? '6.4' : '5.6'}
          fill="var(--os-mark-signal, var(--os-signal))"
        />
      </g>
    </svg>
  );
}
```

`--os-tile` and `--os-mark-signal` are unset by default and exist so a caller
can invert the tile (lime on forest) without a second component.

`packages/brand/src/index.ts` becomes:

```ts
export { CommitRing, type CommitRingProps } from './CommitRing.js';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oneshot/brand test commit-ring`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/brand/src/CommitRing.tsx packages/brand/src/index.ts packages/brand/test/commit-ring.test.tsx
git commit -m "feat(brand): add the commit-ring mark with its reduced cut"
```

---

### Task 3: Derived hero geometry

**Files:**

- Create: `packages/brand/src/heroCut.ts`
- Modify: `packages/brand/src/index.ts`
- Test: `packages/brand/test/hero-cut.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `heroClipPaths(width: number, height: number): HeroClipPaths` where `HeroClipPaths` is `{ readonly panel: string; readonly figure: string }`, plus exported constants `HERO_CHANNEL = 14`, `HERO_RADIUS = 24`, `HERO_MIN_WIDTH = 720`. Both strings are SVG path data for a `clipPath` with `clipPathUnits="userSpaceOnUse"`.

- [ ] **Step 1: Write the failing test**

`packages/brand/test/hero-cut.test.ts`:

```ts
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
    // Six vertices each: four box corners plus two diagonal apexes.
    expect(panel.match(/Q/gu)).toHaveLength(6);
    expect(figure.match(/Q/gu)).toHaveLength(6);
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oneshot/brand test hero-cut`
Expected: FAIL — cannot resolve `../src/heroCut.js`.

- [ ] **Step 3: Write the implementation**

`packages/brand/src/heroCut.ts`:

```ts
/**
 * Geometry for the hero's diagonal cut.
 *
 * The dark panel and the green figure are cut on parallel diagonals rising to
 * the right, the panel wider at the top, with a channel of page ground between
 * them and every vertex rounded — including the acute ones, which is why this
 * emits path data for `clipPathUnits="userSpaceOnUse"` rather than a polygon
 * clip-path: polygons cannot round corners.
 *
 * The canvas drew this once, at 1032x268. Deriving it means the hero is no
 * longer locked to that size. Both ratios below are read off that drawing.
 */

/** Horizontal run of the diagonal per unit of height, from the canvas. */
const DIAGONAL_RATIO = 114 / 268;

/** Where the panel's diagonal leaves the top edge, as a fraction of width. */
const SPLIT = 0.65;

/** Gap between the two shapes, measured perpendicular to the cut. */
export const HERO_CHANNEL = 14;

/** Corner radius on every vertex. */
export const HERO_RADIUS = 24;

/** Below this width the acute corners stop reading; render a plain panel. */
export const HERO_MIN_WIDTH = 720;

export interface HeroClipPaths {
  readonly panel: string;
  readonly figure: string;
}

function round(value: number): string {
  return String(Math.round(value * 10) / 10);
}

export function heroClipPaths(width: number, height: number): HeroClipPaths {
  if (width <= 0 || height <= 0) {
    throw new Error('heroClipPaths requires a positive width and height');
  }

  const lean = DIAGONAL_RATIO * height;
  const hypotenuse = Math.hypot(lean, height);
  // Horizontal distance between the two parallel cuts that yields the wanted
  // perpendicular channel.
  const offset = (HERO_CHANNEL * hypotenuse) / height;
  const radius = Math.min(HERO_RADIUS, width / 4, height / 4);

  // Step of one radius along the cut, which each rounded apex backs off by.
  const stepX = (-lean / hypotenuse) * radius;
  const stepY = (height / hypotenuse) * radius;

  const panelTop = SPLIT * width;
  const panelBottom = panelTop - lean;
  const figureTop = panelTop + offset;
  const figureBottom = panelBottom + offset;

  const r = round;

  const panel = [
    `M${r(radius)} 0`,
    `L${r(panelTop - radius)} 0`,
    `Q${r(panelTop)} 0 ${r(panelTop + stepX)} ${r(stepY)}`,
    `L${r(panelBottom - stepX)} ${r(height - stepY)}`,
    `Q${r(panelBottom)} ${r(height)} ${r(panelBottom - radius)} ${r(height)}`,
    `L${r(radius)} ${r(height)}`,
    `Q0 ${r(height)} 0 ${r(height - radius)}`,
    `L0 ${r(radius)}`,
    `Q0 0 ${r(radius)} 0`,
    'Z',
  ].join(' ');

  const figure = [
    `M${r(figureTop + radius)} 0`,
    `L${r(width - radius)} 0`,
    `Q${r(width)} 0 ${r(width)} ${r(radius)}`,
    `L${r(width)} ${r(height - radius)}`,
    `Q${r(width)} ${r(height)} ${r(width - radius)} ${r(height)}`,
    `L${r(figureBottom + radius)} ${r(height)}`,
    `Q${r(figureBottom)} ${r(height)} ${r(figureBottom - stepX)} ${r(height - stepY)}`,
    `L${r(figureTop + stepX)} ${r(stepY)}`,
    `Q${r(figureTop)} 0 ${r(figureTop + radius)} 0`,
    'Z',
  ].join(' ');

  return { panel, figure };
}
```

`packages/brand/src/index.ts` becomes:

```ts
export { CommitRing, type CommitRingProps } from './CommitRing.js';
export {
  heroClipPaths,
  HERO_CHANNEL,
  HERO_MIN_WIDTH,
  HERO_RADIUS,
  type HeroClipPaths,
} from './heroCut.js';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oneshot/brand test hero-cut`
Expected: PASS, 7 tests.

If the canvas-parity assertions miss by a tenth, correct the **expected**
numbers, never the constants — the constants are the design, the rounding is
presentation.

- [ ] **Step 5: Verify the package and commit**

Run: `pnpm --filter @oneshot/brand verify`

```bash
git add packages/brand/src/heroCut.ts packages/brand/src/index.ts packages/brand/test/hero-cut.test.ts
git commit -m "feat(brand): derive the diagonal hero cut from the box size"
```

---

### Task 4: Theme module and pre-paint guard

**Files:**

- Create: `apps/web/src/theme.ts`
- Modify: `apps/web/index.html`
- Modify: `apps/web/package.json`, `apps/web/tsconfig.json`
- Modify: `apps/web/vite.config.ts`, `apps/web/vitest.config.ts`
- Test: `apps/web/test/theme.test.ts`

**Interfaces:**

- Consumes: `@oneshot/brand/tokens.css` and `@oneshot/brand/fonts.css` from Task 1.
- Produces: `type Theme = 'light' | 'dark'`; `readStoredTheme(): Theme` (defaults to `'dark'`, tolerates a throwing `localStorage`); `applyTheme(theme: Theme): void` (stamps `data-theme` on `document.documentElement` and persists); `THEME_STORAGE_KEY = 'oneshot.theme'`.

- [ ] **Step 1: Write the failing test**

`apps/web/test/theme.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyTheme, readStoredTheme, THEME_STORAGE_KEY } from '../src/theme.js';

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  vi.unstubAllGlobals();
});

describe('theme', () => {
  it('defaults to dark when nothing is stored', () => {
    expect(readStoredTheme()).toBe('dark');
  });

  it('reads a stored choice back', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(readStoredTheme()).toBe('light');
  });

  it('ignores a stored value that is not a theme', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    expect(readStoredTheme()).toBe('dark');
  });

  it('stamps the document and persists the choice', () => {
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('still applies the theme when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('site data blocked');
      },
      setItem() {
        throw new Error('site data blocked');
      },
    });
    expect(readStoredTheme()).toBe('dark');
    expect(() => applyTheme('light')).not.toThrow();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oneshot/web test theme`
Expected: FAIL — cannot resolve `../src/theme.js`.

- [ ] **Step 3: Write the module**

`apps/web/src/theme.ts`:

```ts
/**
 * Theme selection.
 *
 * Dark is the default. The choice is stamped on <html> as `data-theme`, which
 * is what the brand token stylesheet switches on, and mirrored into
 * localStorage so it survives a reload. A private window or blocked site data
 * makes both storage calls throw; the theme must still apply, so every access
 * is guarded and falls back to the default.
 *
 * The inline guard in index.html performs the same read before first paint.
 * Keep the two in step: a divergence shows up as a flash of the wrong palette.
 */

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'oneshot.theme';

const DEFAULT_THEME: Theme = 'dark';

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark';
}

export function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Site data is unavailable. The theme still applies for this page view.
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oneshot/web test theme`
Expected: PASS, 5 tests.

- [ ] **Step 5: Wire the package, the aliases, and the pre-paint guard**

In `apps/web/package.json`, add to `dependencies`, keeping the block alphabetical:

```json
    "@oneshot/brand": "workspace:*",
```

In `apps/web/tsconfig.json`, add to `references`:

```json
    { "path": "../../packages/brand" },
```

In **both** `apps/web/vite.config.ts` and `apps/web/vitest.config.ts`, add these
entries to `resolve.alias` **above** the existing `@oneshot/recovery-ui` ones,
so the bare-package alias cannot shadow the CSS specifiers. Both files already
import `fileURLToPath`:

```ts
      '@oneshot/brand/tokens.css': fileURLToPath(
        new URL('../../packages/brand/src/tokens.css', import.meta.url),
      ),
      '@oneshot/brand/fonts.css': fileURLToPath(
        new URL('../../packages/brand/src/fonts.css', import.meta.url),
      ),
      '@oneshot/brand': fileURLToPath(new URL('../../packages/brand/src/index.ts', import.meta.url)),
```

Replace the `<head>` of `apps/web/index.html` with:

```html
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="OneShot: Exactly-once stablecoin payment settlement engine with pre-execution policy checks and hashless recovery on Arc Testnet." />
    <link rel="icon" type="image/png" href="/logo.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <title>OneShot — Arc Testnet Stablecoin Engine</title>
    <script>
      // Stamp the theme before first paint so no frame renders in the wrong
      // palette. Mirrors apps/web/src/theme.ts; keep the two in step.
      (function () {
        var theme = 'dark';
        try {
          var stored = window.localStorage.getItem('oneshot.theme');
          if (stored === 'light' || stored === 'dark') theme = stored;
        } catch (error) {
          // Site data unavailable; the default stands.
        }
        document.documentElement.setAttribute('data-theme', theme);
      })();
    </script>
  </head>
```

- [ ] **Step 6: Verify the workspace resolves**

Run: `pnpm install`
Run: `pnpm --filter @oneshot/web test theme`
Run: `pnpm typecheck`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/theme.ts apps/web/test/theme.test.ts apps/web/index.html apps/web/package.json apps/web/tsconfig.json apps/web/vite.config.ts apps/web/vitest.config.ts pnpm-lock.yaml
git commit -m "feat(web): add theme selection with a pre-paint guard"
```

---

### Task 5: Repaint the web stylesheet onto the tokens

**Files:**

- Modify: `apps/web/src/styles.css` (whole file, 1252 lines)
- Test: `apps/web/test/styles.test.ts`

**Interfaces:**

- Consumes: every `--os-*` token from Task 1.
- Produces: the existing class contract, unchanged in name, plus new classes consumed by Tasks 6, 7 and 10: `.theme-toggle`, `.hero-cut`, `.hero-figure`, `.hero-panel`, `.hero-copy`, `.hero-plain`, `.wallet-picker`, `.wallet-search`, `.wallet-list`, `.wallet-option`, `.wallet-actions`.

- [ ] **Step 1: Write the failing guard test**

`apps/web/test/styles.test.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const stylesheet = fileURLToPath(new URL('../src/styles.css', import.meta.url));

describe('web stylesheet', () => {
  it('holds no colour of its own', async () => {
    const css = await readFile(stylesheet, 'utf8');
    const literals = [
      ...[...css.matchAll(/#[0-9a-f]{3,8}\b/giu)].map((match) => match[0]),
      ...[...css.matchAll(/\brgba?\(\s*\d[^)]*\)/giu)].map((match) => match[0]),
    ];
    expect(literals).toEqual([]);
  });

  it('imports the brand fonts and tokens, fonts first', async () => {
    const css = await readFile(stylesheet, 'utf8');
    expect(css.indexOf("@import '@oneshot/brand/fonts.css';")).toBe(0);
    expect(css).toContain("@import '@oneshot/brand/tokens.css';");
  });

  it('sets the page ground and primary type from tokens', async () => {
    const css = await readFile(stylesheet, 'utf8');
    expect(css).toMatch(/body\s*\{[^}]*background:\s*var\(--os-ground\)/u);
    expect(css).toMatch(/body\s*\{[^}]*font-family:\s*var\(--os-font-primary\)/u);
    expect(css).toMatch(/body\s*\{[^}]*font-weight:\s*300/u);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oneshot/web test styles`
Expected: FAIL — dozens of literals, no imports.

- [ ] **Step 3: Replace the token block at the top of the file**

Replace lines 1–39 — the whole `:root { … }` block — with:

```css
@import '@oneshot/brand/fonts.css';
@import '@oneshot/brand/tokens.css';

/**
 * The operator console shell.
 *
 * Every colour here comes from @oneshot/brand. The guard in
 * test/styles.test.ts fails the build if a literal creeps back in.
 *
 * The diagonal cut belongs to the hero alone; every other surface below is a
 * plain rounded rectangle.
 */

:root {
  color: var(--os-ink);
  background-color: var(--os-ground);
  font-family: var(--os-font-primary);
  font-weight: 300;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background: var(--os-ground);
  color: var(--os-ink);
  font-family: var(--os-font-primary);
  font-weight: 300;
}
```

The two `@import` rules must be the first lines in the file — CSS ignores an
`@import` that follows any other rule.

- [ ] **Step 4: Sweep the remaining rules**

Work top to bottom. Apply this mapping to every declaration. Where a rule used a
translucent navy or a glow, delete the effect rather than inventing a token —
the brand is flat.

| Was | Becomes |
| --- | --- |
| `var(--bg-base)` | `var(--os-ground)` |
| `var(--bg-surface)`, `var(--bg-surface-elevated)`, `var(--bg-input)` | `var(--os-surface)` |
| `var(--border-subtle)`, `var(--border-active)` | `var(--os-line)` |
| `var(--border-focus)` | `var(--os-signal)` |
| `var(--text-primary)` | `var(--os-ink)` |
| `var(--text-secondary)`, `var(--text-muted)` | `var(--os-ink-muted)` |
| `var(--cyan-accent)`, `var(--blue-accent)`, `var(--blue-light)` | `var(--os-signal)` |
| `var(--cyan-glow)` | delete the declaration |
| `var(--success-text)` | `var(--os-state-committed)` |
| `var(--warning-text)` | `var(--os-state-unknown)` |
| `var(--error-text)` | `var(--os-state-failed)` |
| `var(--success-bg)`, `var(--warning-bg)`, `var(--error-bg)` | `var(--os-panel)` |
| `var(--success-border)`, `var(--warning-border)`, `var(--error-border)` | `var(--os-line)` |
| any `box-shadow` carrying a colour | delete the declaration |
| any `linear-gradient(...)` on a button or card | the flat token fill |
| `border-radius` on a control | `999px` |
| `border-radius` on a card or section | `var(--os-radius-lg)` |
| `font-weight: 600` or `700` | `300` |

Panels, cards and the console container take `background: var(--os-panel); color: var(--os-panel-ink);`. Text inside them that was `--text-secondary` becomes `var(--os-panel-ink-muted)`, not `var(--os-ink-muted)` — the muted ink token is for the page ground.

- [ ] **Step 5: Replace the three rules that change shape, not just colour**

Buttons (was lines 60–119):

```css
button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 42px;
  padding: 0.65rem 1.25rem;
  border: 0;
  border-radius: 999px;
  color: var(--os-on-signal);
  background: var(--os-signal);
  font-family: var(--os-font-primary);
  font-weight: 300;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

button:hover:not(:disabled) {
  opacity: 0.86;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

button.secondary {
  color: var(--os-ink);
  background: transparent;
  border: 1px solid var(--os-line-strong);
}

button.compact {
  min-height: 32px;
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
}
```

The tab strip (was lines 747–788):

```css
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 18px;
}

.tabs button {
  min-height: 38px;
  color: var(--os-panel-ink);
  background: transparent;
  border: 1px solid var(--os-line-strong);
}

.tabs button[aria-selected='true'] {
  color: var(--os-on-signal);
  background: var(--os-signal);
  border-color: var(--os-signal);
}
```

The state card (was lines 927–981):

```css
.state-card {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 18px;
  padding: 20px 24px;
  border-radius: var(--os-radius);
  background: var(--os-panel);
  color: var(--os-panel-ink);
}

.state-card small {
  display: block;
  color: var(--os-panel-ink-muted);
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.state-card strong {
  font-weight: 300;
  font-size: 1.4rem;
}

.state-committed strong {
  color: var(--os-state-committed);
}

.state-unknown strong {
  color: var(--os-state-unknown);
}

.state-rejected strong {
  color: var(--os-state-failed);
}
```

- [ ] **Step 6: Add the classes Tasks 6, 7 and 10 need**

Append, before the closing `@media (max-width: 768px)` block:

```css
.theme-toggle {
  min-height: 34px;
  padding: 0.3rem 0.9rem;
  color: var(--os-ink);
  background: transparent;
  border: 1px solid var(--os-line-strong);
  font-size: 0.78rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.hero-cut {
  position: relative;
}

.hero-figure,
.hero-panel {
  position: absolute;
  inset: 0;
}

.hero-figure {
  background: linear-gradient(
    155deg,
    var(--os-field) 0%,
    var(--os-signal) 34%,
    var(--os-panel) 78%,
    var(--os-ground) 100%
  );
}

.hero-figure::after {
  content: '';
  position: absolute;
  inset: -22%;
  background: repeating-linear-gradient(
    104deg,
    var(--os-field) 0 26px,
    var(--os-panel) 26px 78px
  );
  filter: blur(17px);
  opacity: 0.55;
}

.hero-panel {
  background: var(--os-panel);
}

.hero-copy {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
  width: 50%;
  padding: 26px 28px;
  color: var(--os-panel-ink);
}

.hero-plain {
  padding: 32px;
  border-radius: var(--os-radius-lg);
  background: var(--os-panel);
  color: var(--os-panel-ink);
}

.wallet-picker {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 460px;
}

.wallet-search {
  min-height: 42px;
  padding: 0 16px;
  border: 1px solid var(--os-line-strong);
  border-radius: 999px;
  color: var(--os-ink);
  background: var(--os-surface);
  font-family: var(--os-font-secondary);
}

.wallet-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 320px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.wallet-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: var(--os-radius);
  cursor: pointer;
}

.wallet-option:hover,
.wallet-option[aria-selected='true'] {
  background: var(--os-signal);
  color: var(--os-on-signal);
}

.wallet-option small {
  margin-left: auto;
  font-size: 0.72rem;
}

.wallet-actions {
  display: flex;
  gap: 8px;
}
```

`.hero-figure::after` is the one place opacity carries meaning — a blurred band
on a decorative gradient, not the mark.

- [ ] **Step 7: Run the guard and every existing suite**

Run: `pnpm --filter @oneshot/web test`
Expected: `styles.test.ts` passes with an empty literal list, and every existing suite still passes.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/styles.css apps/web/test/styles.test.ts
git commit -m "feat(web): repaint the console shell onto the brand tokens"
```

---

### Task 6: Brand the shell and add the theme toggle

**Files:**

- Modify: `apps/web/src/App.tsx` (the `top-nav` block at lines 88–120, the footer brand block at lines 235–255)
- Test: `apps/web/test/app-brand.test.tsx`

**Interfaces:**

- Consumes: `CommitRing` from Task 2; `applyTheme`, `readStoredTheme`, `type Theme` from Task 4; `.theme-toggle` from Task 5.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the failing test**

`apps/web/test/app-brand.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from '../src/App.js';

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('branded shell', () => {
  it('names the mark in the navigation', () => {
    render(<App />);
    expect(screen.getAllByRole('img', { name: 'OneShot' }).length).toBeGreaterThan(0);
  });

  it('renders no placeholder logo image', () => {
    const { container } = render(<App />);
    expect(container.querySelector('img[src="/logo.png"]')).toBeNull();
  });

  it('switches the theme and remembers the choice', async () => {
    const user = userEvent.setup();
    render(<App />);
    const toggle = screen.getByRole('button', { name: /theme/iu });

    await user.click(toggle);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem('oneshot.theme')).toBe('light');

    await user.click(toggle);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oneshot/web test app-brand`
Expected: FAIL — no accessible image named `OneShot`, no theme button.

- [ ] **Step 3: Wire the mark and the toggle**

Add to the imports at the top of `apps/web/src/App.tsx`:

```tsx
import { CommitRing } from '@oneshot/brand';

import { applyTheme, readStoredTheme, type Theme } from './theme.js';
```

Inside `App`, beside the existing `useState` calls:

```tsx
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme());

  function toggleTheme(): void {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  }
```

Replace the `brand-group` block inside `top-nav` with:

```tsx
          <div className="brand-group">
            <CommitRing size={36} title="OneShot" />
            <div className="brand-text">
              <span className="brand-name">OneShot</span>
              <span className="brand-tag">SETTLEMENT ENGINE</span>
            </div>
          </div>
```

Add the toggle as the last child of `nav-status-group`:

```tsx
            <button type="button" className="theme-toggle" onClick={toggleTheme}>
              {theme === 'dark' ? 'Light theme' : 'Dark theme'}
            </button>
```

In the footer, replace the `<img>` with `<CommitRing size={28} />` and set the
wordmark span's text to `OneShot`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oneshot/web test app-brand`
Expected: PASS, 3 tests.

- [ ] **Step 5: Run every web suite**

Run: `pnpm --filter @oneshot/web test`
Expected: PASS. `app-composition.test.tsx` and `app-auth.test.tsx` query by role
and accessible name, so the mark swap does not disturb them. If
`composition.test.tsx:97` — which asserts an empty surface holds no interactive
element — fails, the toggle landed in the wrong subtree: it belongs in
`top-nav`, outside every panel.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/App.tsx apps/web/test/app-brand.test.tsx
git commit -m "feat(web): put the commit-ring mark and the theme toggle in the shell"
```

---

### Task 7: The diagonal hero

**Files:**

- Create: `apps/web/src/components/Hero.tsx`
- Modify: `apps/web/src/App.tsx` (the `app-header hero-section` block)
- Test: `apps/web/test/hero.test.tsx`

**Interfaces:**

- Consumes: `heroClipPaths`, `HERO_MIN_WIDTH` from Task 3; the `.hero-*` classes from Task 5.
- Produces: `Hero`, taking `{ readonly children: ReactNode }` and rendering the cut around that copy.

- [ ] **Step 1: Write the failing test**

`apps/web/test/hero.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Hero } from '../src/components/Hero.js';

/** jsdom reports zero for every layout box, so width is stubbed per case. */
function stubWidth(width: number): void {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Hero', () => {
  it('cuts the diagonal at desktop width', () => {
    stubWidth(1032);
    const { container } = render(
      <Hero>
        <h1>One job. Many retries. One settlement.</h1>
      </Hero>,
    );
    expect(container.querySelector('.hero-cut')).not.toBeNull();
    expect(container.querySelectorAll('clipPath')).toHaveLength(2);
    expect(container.querySelector('clipPath')?.getAttribute('clipPathUnits')).toBe(
      'userSpaceOnUse',
    );
  });

  it('falls back to a plain panel below the minimum width', () => {
    stubWidth(480);
    const { container } = render(
      <Hero>
        <h1>One job. Many retries. One settlement.</h1>
      </Hero>,
    );
    expect(container.querySelector('.hero-cut')).toBeNull();
    expect(container.querySelector('.hero-plain')).not.toBeNull();
  });

  it('renders its copy in both modes', () => {
    for (const width of [1032, 480]) {
      stubWidth(width);
      const { container, unmount } = render(
        <Hero>
          <h1>One job. Many retries. One settlement.</h1>
        </Hero>,
      );
      expect(container.textContent).toContain('One job. Many retries. One settlement.');
      unmount();
    }
  });

  it('gives each instance unique clip-path ids', () => {
    stubWidth(1032);
    const { container } = render(
      <>
        <Hero>
          <p>first</p>
        </Hero>
        <Hero>
          <p>second</p>
        </Hero>
      </>,
    );
    const ids = [...container.querySelectorAll('clipPath')].map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oneshot/web test hero`
Expected: FAIL — cannot resolve `../src/components/Hero.js`.

- [ ] **Step 3: Write the component**

`apps/web/src/components/Hero.tsx`:

```tsx
import { HERO_MIN_WIDTH, heroClipPaths } from '@oneshot/brand';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * The hero, and the only diagonal cut in the product.
 *
 * The two shapes are clipped, not drawn, so the copy over them stays real text.
 * Rounding the acute corners needs `clipPathUnits="userSpaceOnUse"`, which
 * means real pixels — hence the measurement. Narrow viewports lose the cut
 * entirely: below the minimum width the acute corners collapse into a smudge,
 * so the hero becomes the same content on a plain rounded panel.
 */

const HERO_HEIGHT = 268;

export function Hero({ children }: { readonly children: ReactNode }) {
  const box = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const id = useId();

  useEffect(() => {
    const element = box.current;
    if (element === null) return;

    const measure = (): void => setWidth(element.clientWidth);
    measure();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const cut = width >= HERO_MIN_WIDTH ? heroClipPaths(width, HERO_HEIGHT) : null;
  // useId's punctuation varies by React version and ends up inside a `url(#…)`
  // reference. Strip it; the uniqueness still comes from React.
  const safeId = id.replace(/[^a-zA-Z0-9]/gu, '');
  const panelClip = `${safeId}-panel`;
  const figureClip = `${safeId}-figure`;

  return (
    <div ref={box}>
      {cut === null ? (
        <div className="hero-plain">{children}</div>
      ) : (
        <div className="hero-cut" style={{ height: `${HERO_HEIGHT}px` }}>
          <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
            <clipPath id={panelClip} clipPathUnits="userSpaceOnUse">
              <path d={cut.panel} />
            </clipPath>
            <clipPath id={figureClip} clipPathUnits="userSpaceOnUse">
              <path d={cut.figure} />
            </clipPath>
          </svg>
          <div
            className="hero-figure"
            aria-hidden="true"
            style={{ clipPath: `url(#${figureClip})` }}
          />
          <div className="hero-panel" style={{ clipPath: `url(#${panelClip})` }} />
          <div className="hero-copy">{children}</div>
        </div>
      )}
    </div>
  );
}
```

Do not replace the sanitised `useId` with a constant id — a constant would make
two heroes on one page share a clip path, which is what the fourth test guards.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oneshot/web test hero`
Expected: PASS, 4 tests.

- [ ] **Step 5: Use it in the shell**

In `apps/web/src/App.tsx`, wrap the hero content. The `<header>` keeps its
classes and `ReadinessBanner` stays outside the cut:

```tsx
        <header className="app-header hero-section">
          <Hero>
            <p className="eyebrow">ONESHOT / ARC TESTNET</p>
            <h1>One job. Many retries. One settlement.</h1>
            <p className="hero-lead">
              Deterministic payment lifecycle with pre-execution policy checks, idempotency
              enforcement, and hashless recovery on Arc.
            </p>
            <div className="hero-actions">
              <a href="#console" className="btn-hero-cta">
                Open Operator Console ↓
              </a>
              <a
                href="https://testnet.arcscan.app"
                target="_blank"
                rel="noreferrer"
                className="btn-hero-secondary"
              >
                ArcScan Explorer ↗
              </a>
            </div>
          </Hero>
          <ReadinessBanner client={apiClient} />
        </header>
```

Add `import { Hero } from './components/Hero.js';`.

The `hero-sublead` paragraph is dropped: the cut leaves room for one lead line,
and the sentence it carried repeats the console heading below it.

- [ ] **Step 6: Run every web suite and commit**

Run: `pnpm --filter @oneshot/web test`

```bash
git add apps/web/src/components/Hero.tsx apps/web/src/App.tsx apps/web/test/hero.test.tsx
git commit -m "feat(web): cut the diagonal hero from derived geometry"
```

---

### Task 8: Repoint the slice stylesheets

**Files:**

- Modify: `packages/settlement-ui/src/styles.css`, `packages/recovery-ui/src/styles.css`
- Modify: `packages/settlement-ui/test/contrast.test.ts`
- Modify: both packages' `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`

**Interfaces:**

- Consumes: the `--os-*` tokens from Task 1.
- Produces: nothing later tasks depend on. Both slices keep their internal `--ink`, `--muted`, `--line`, `--panel`, `--green`, `--amber`, `--red`, `--cyan` names, so no component code changes.

- [ ] **Step 1: Teach the existing contrast test to resolve `var()`**

`packages/settlement-ui/test/contrast.test.ts` reads hexes straight out of the
slice stylesheet. After this task those declarations are `var()` references, so
the reader must follow them into the brand tokens. Add beside `readCss`:

```ts
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
```

Widen `readTokens` and `readDeclaration` to capture `[^;]+` instead of
`#[0-9a-f]{6}`, and run every captured value through `resolveColour`. Each test
body gains `const brand = await readBrandCss();` and threads `brand` through.
Every assertion below stays exactly as it is.

- [ ] **Step 2: Run the test to verify it still passes**

Run: `pnpm --filter @oneshot/settlement-ui test contrast`
Expected: PASS — the stylesheet has not changed yet, so this proves the resolver
is transparent to literals. A failure here is the resolver's fault, not the
palette's.

- [ ] **Step 3: Repoint the settlement slice**

Add as the **first line** of `packages/settlement-ui/src/styles.css`, outside
the `@scope` block, since `@import` must lead the file:

```css
@import '@oneshot/brand/tokens.css';
```

Replace the token block in the `.settlement-details, .route-state` rule:

```css
  --ink: var(--os-panel-ink);
  --muted: var(--os-panel-ink-muted);
  --line: var(--os-line);
  --panel: var(--os-panel);
  --green: var(--os-state-committed);
  --amber: var(--os-state-unknown);
  --red: var(--os-state-failed);
  --cyan: var(--os-signal);
  font-family: var(--os-font-secondary);
  font-weight: 300;
  background: var(--os-panel);
```

The slice's surface is `--os-panel`, not `--os-ground`. The slices render inside
the console panel, and `--os-panel` is one of the tokens that does **not** change
between themes — so light ink on it stays readable in both. Setting the ground
here would put light ink on a near-white page in the light theme.

Then sweep the 16 remaining literal hexes in the file onto the same tokens using
the mapping table from Task 5.

- [ ] **Step 4: Repoint the recovery slice**

Same treatment for `packages/recovery-ui/src/styles.css`: the import first, then
the `:scope` token block repointed as above with `--panel-strong: var(--os-panel)`,
then the 22 remaining literal hexes swept. The fixture `.demo-bar` keeps its
warning role: `color: var(--os-state-unknown)` on `background: var(--os-panel)`.

- [ ] **Step 5: Wire both packages to brand**

In each of `packages/settlement-ui/package.json` and
`packages/recovery-ui/package.json`, add to `dependencies`:

```json
    "@oneshot/brand": "workspace:*",
```

In each `tsconfig.json`, add `{ "path": "../brand" }` to `references`.

In each package's `vite.config.ts` and `vitest.config.ts`, add a `resolve` block
(or extend the existing one) with `import { fileURLToPath } from 'node:url';` at
the top:

```ts
  resolve: {
    alias: {
      '@oneshot/brand/tokens.css': fileURLToPath(
        new URL('../brand/src/tokens.css', import.meta.url),
      ),
    },
  },
```

- [ ] **Step 6: Run both packages**

Run: `pnpm install`
Run: `pnpm --filter @oneshot/settlement-ui test`
Run: `pnpm --filter @oneshot/recovery-ui test`
Expected: PASS, including the contrast audit now resolving through the brand
tokens and the zero-interactive-element assertions.

- [ ] **Step 7: Commit**

```bash
git add packages/settlement-ui packages/recovery-ui pnpm-lock.yaml
git commit -m "feat(ui): read the slice palettes from the brand tokens"
```

---

### Task 9: Wallet detection and catalogue

**Files:**

- Create: `apps/web/src/auth/eip6963.ts`
- Create: `apps/web/src/auth/wallet-catalogue.ts`
- Test: `apps/web/test/eip6963.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `interface Eip1193Provider { request(args: { readonly method: string; readonly params?: readonly unknown[] }): Promise<unknown> }`
  - `interface DetectedWallet { readonly uuid: string; readonly name: string; readonly rdns: string; readonly icon: string; readonly provider: Eip1193Provider }`
  - `interface WalletStore { readonly wallets: readonly DetectedWallet[]; readonly subscribe: (listener: () => void) => () => void }`
  - `detectWallets(): WalletStore`
  - `interface CatalogueWallet { readonly id: string; readonly name: string }` and `WALLET_CATALOGUE: readonly CatalogueWallet[]`

- [ ] **Step 1: Write the failing test**

`apps/web/test/eip6963.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { detectWallets, type Eip1193Provider } from '../src/auth/eip6963.js';
import { WALLET_CATALOGUE } from '../src/auth/wallet-catalogue.js';

const provider: Eip1193Provider = { request: vi.fn() };

function announce(uuid: string, name: string, rdns: string): void {
  window.dispatchEvent(
    new CustomEvent('eip6963:announceProvider', {
      detail: { info: { uuid, name, rdns, icon: 'data:image/svg+xml,<svg/>' }, provider },
    }),
  );
}

describe('detectWallets', () => {
  it('collects announced wallets and notifies subscribers', () => {
    const store = detectWallets();
    const listener = vi.fn();
    store.subscribe(listener);

    announce('a', 'Rabbit Wallet', 'io.rabbit');
    expect(listener).toHaveBeenCalled();
    expect(store.wallets.map((wallet) => wallet.name)).toContain('Rabbit Wallet');
  });

  it('ignores a repeat announcement of the same wallet', () => {
    const store = detectWallets();
    announce('b', 'Rabbit Wallet', 'io.rabbit');
    announce('b', 'Rabbit Wallet', 'io.rabbit');
    expect(store.wallets.filter((wallet) => wallet.uuid === 'b')).toHaveLength(1);
  });

  it('ignores a malformed announcement', () => {
    const store = detectWallets();
    const before = store.wallets.length;
    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info: {} } }));
    expect(store.wallets).toHaveLength(before);
  });

  it('stops notifying after unsubscribe', () => {
    const store = detectWallets();
    const listener = vi.fn();
    store.subscribe(listener)();
    announce('c', 'Another Wallet', 'io.another');
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('WALLET_CATALOGUE', () => {
  it('lists the known wallets with unique ids', () => {
    const ids = WALLET_CATALOGUE.map((wallet) => wallet.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('metamask');
    expect(ids).toContain('coinbase_wallet');
    expect(ids).toContain('wallet_connect');
  });
});
```

Every wallet store in this suite listens on the same `window`, so give each case
a distinct `uuid` — the second test depends on it.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oneshot/web test eip6963`
Expected: FAIL — neither module resolves.

- [ ] **Step 3: Write the detection module**

`apps/web/src/auth/eip6963.ts`:

```ts
/**
 * EIP-6963 wallet discovery.
 *
 * Wallets announce themselves in response to a request event, so the list
 * arrives asynchronously and can grow after first paint. Announcements come
 * from browser extensions and are untrusted input: every field is validated
 * before it reaches the picker, and nothing announced is ever logged.
 */

export interface Eip1193Provider {
  request(args: { readonly method: string; readonly params?: readonly unknown[] }): Promise<unknown>;
}

export interface DetectedWallet {
  readonly uuid: string;
  readonly name: string;
  readonly rdns: string;
  readonly icon: string;
  readonly provider: Eip1193Provider;
}

export interface WalletStore {
  readonly wallets: readonly DetectedWallet[];
  readonly subscribe: (listener: () => void) => () => void;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function parseAnnouncement(detail: unknown): DetectedWallet | null {
  if (typeof detail !== 'object' || detail === null) return null;
  const { info, provider } = detail as { info?: unknown; provider?: unknown };
  if (typeof info !== 'object' || info === null) return null;
  const { uuid, name, rdns, icon } = info as Record<string, unknown>;
  if (!isNonEmptyString(uuid) || !isNonEmptyString(name)) return null;
  if (!isNonEmptyString(rdns) || !isNonEmptyString(icon)) return null;
  if (typeof provider !== 'object' || provider === null) return null;
  if (typeof (provider as Eip1193Provider).request !== 'function') return null;
  return { uuid, name, rdns, icon, provider: provider as Eip1193Provider };
}

export function detectWallets(): WalletStore {
  const found = new Map<string, DetectedWallet>();
  const listeners = new Set<() => void>();

  window.addEventListener('eip6963:announceProvider', (event: Event) => {
    const wallet = parseAnnouncement((event as CustomEvent<unknown>).detail);
    if (wallet === null || found.has(wallet.uuid)) return;
    found.set(wallet.uuid, wallet);
    for (const listener of listeners) listener();
  });

  window.dispatchEvent(new Event('eip6963:requestProvider'));

  return {
    get wallets() {
      return [...found.values()];
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
```

`apps/web/src/auth/wallet-catalogue.ts`:

```ts
/**
 * Wallets Privy can connect that are not installed in this browser.
 *
 * The ids are Privy's own `WalletListEntry` values, so handing one to Privy's
 * modal as a fallback needs no translation. Detected wallets never come from
 * here — they announce their own names and icons over EIP-6963.
 */

export interface CatalogueWallet {
  readonly id: string;
  readonly name: string;
}

export const WALLET_CATALOGUE: readonly CatalogueWallet[] = [
  { id: 'metamask', name: 'MetaMask' },
  { id: 'coinbase_wallet', name: 'Coinbase Wallet' },
  { id: 'base_account', name: 'Base Account' },
  { id: 'rainbow', name: 'Rainbow' },
  { id: 'phantom', name: 'Phantom' },
  { id: 'zerion', name: 'Zerion' },
  { id: 'cryptocom', name: 'Crypto.com' },
  { id: 'uniswap', name: 'Uniswap Wallet' },
  { id: 'okx_wallet', name: 'OKX Wallet' },
  { id: 'universal_profile', name: 'Universal Profile' },
  { id: 'safe', name: 'Safe' },
  { id: 'bybit_wallet', name: 'Bybit Wallet' },
  { id: 'ronin_wallet', name: 'Ronin Wallet' },
  { id: 'haha_wallet', name: 'HaHa Wallet' },
  { id: 'binance', name: 'Binance Wallet' },
  { id: 'bitget_wallet', name: 'Bitget Wallet' },
  { id: 'wallet_connect', name: 'WalletConnect' },
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oneshot/web test eip6963`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/auth/eip6963.ts apps/web/src/auth/wallet-catalogue.ts apps/web/test/eip6963.test.ts
git commit -m "feat(web): discover installed wallets over EIP-6963"
```

---

### Task 10: The searchable wallet picker

**Files:**

- Create: `apps/web/src/components/WalletPicker.tsx`
- Test: `apps/web/test/wallet-picker.test.tsx`

**Interfaces:**

- Consumes: `detectWallets`, `DetectedWallet`, `WalletStore` from Task 9; `WALLET_CATALOGUE` from Task 9; the `.wallet-*` classes from Task 5.
- Produces: `WalletPicker`, taking

```ts
interface WalletPickerProps {
  readonly signIn: (wallet: DetectedWallet) => Promise<void>;
  readonly onOtherWallet: () => void;
  readonly onEmail: () => void;
  readonly store?: WalletStore;
}
```

`store` is injected only by tests; production omits it and the component calls `detectWallets()` once.

- [ ] **Step 1: Write the failing test**

`apps/web/test/wallet-picker.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { DetectedWallet, WalletStore } from '../src/auth/eip6963.js';
import { WalletPicker } from '../src/components/WalletPicker.js';

function wallet(name: string, rdns: string): DetectedWallet {
  return { uuid: rdns, name, rdns, icon: 'data:image/svg+xml,<svg/>', provider: { request: vi.fn() } };
}

function storeOf(...wallets: readonly DetectedWallet[]): WalletStore {
  return { wallets, subscribe: () => () => undefined };
}

const noop = (): void => undefined;
const resolve = async (): Promise<void> => undefined;

describe('WalletPicker', () => {
  it('lists detected wallets before the catalogue', () => {
    render(
      <WalletPicker
        store={storeOf(wallet('Rabbit Wallet', 'io.rabbit'))}
        signIn={resolve}
        onOtherWallet={noop}
        onEmail={noop}
      />,
    );
    const options = screen.getAllByRole('option').map((node) => node.textContent ?? '');
    expect(options[0]).toContain('Rabbit Wallet');
    expect(options.join(' ')).toContain('MetaMask');
  });

  it('filters both groups as you type', async () => {
    const user = userEvent.setup();
    render(
      <WalletPicker
        store={storeOf(wallet('Rabbit Wallet', 'io.rabbit'))}
        signIn={resolve}
        onOtherWallet={noop}
        onEmail={noop}
      />,
    );
    await user.type(screen.getByRole('searchbox', { name: /search wallets/iu }), 'rain');
    const options = screen.getAllByRole('option').map((node) => node.textContent ?? '');
    expect(options.join(' ')).toContain('Rainbow');
    expect(options.join(' ')).not.toContain('Rabbit Wallet');
  });

  it('says so when nothing matches', async () => {
    const user = userEvent.setup();
    render(
      <WalletPicker store={storeOf()} signIn={resolve} onOtherWallet={noop} onEmail={noop} />,
    );
    await user.type(screen.getByRole('searchbox', { name: /search wallets/iu }), 'zzzz');
    expect(screen.getByRole('status').textContent).toMatch(/no wallet matches/iu);
  });

  it('moves the active option with the arrow keys and signs in on Enter', async () => {
    const user = userEvent.setup();
    const detected = wallet('Rabbit Wallet', 'io.rabbit');
    const signIn = vi.fn(resolve);
    render(
      <WalletPicker store={storeOf(detected)} signIn={signIn} onOtherWallet={noop} onEmail={noop} />,
    );
    await user.click(screen.getByRole('searchbox', { name: /search wallets/iu }));
    await user.keyboard('{ArrowDown}{Enter}');
    expect(signIn).toHaveBeenCalledWith(detected);
  });

  it('clears the query on Escape', async () => {
    const user = userEvent.setup();
    render(
      <WalletPicker store={storeOf()} signIn={resolve} onOtherWallet={noop} onEmail={noop} />,
    );
    const search = screen.getByRole('searchbox', { name: /search wallets/iu });
    await user.type(search, 'meta{Escape}');
    expect(search).toHaveValue('');
  });

  it('falls back to Privy for a wallet that is not installed', async () => {
    const user = userEvent.setup();
    const onOtherWallet = vi.fn();
    render(
      <WalletPicker store={storeOf()} signIn={resolve} onOtherWallet={onOtherWallet} onEmail={noop} />,
    );
    await user.click(screen.getByRole('option', { name: /MetaMask/iu }));
    expect(onOtherWallet).toHaveBeenCalled();
  });

  it('surfaces a sign-in failure without leaking detail', async () => {
    const user = userEvent.setup();
    const detected = wallet('Rabbit Wallet', 'io.rabbit');
    render(
      <WalletPicker
        store={storeOf(detected)}
        signIn={async () => {
          throw new Error('0xdeadbeef signature 0x1234');
        }}
        onOtherWallet={noop}
        onEmail={noop}
      />,
    );
    await user.click(screen.getByRole('option', { name: /Rabbit Wallet/iu }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/could not sign in/iu);
    expect(alert.textContent).not.toContain('0xdeadbeef');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oneshot/web test wallet-picker`
Expected: FAIL — cannot resolve `../src/components/WalletPicker.js`.

- [ ] **Step 3: Write the component**

`apps/web/src/components/WalletPicker.tsx`:

```tsx
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';

import { detectWallets, type DetectedWallet, type WalletStore } from '../auth/eip6963.js';
import { WALLET_CATALOGUE } from '../auth/wallet-catalogue.js';

/**
 * The operator's wallet chooser.
 *
 * Privy's own modal lists every wallet it supports with no way to search it,
 * which is more than an operator can scan. This covers the same ground in one
 * searchable box: wallets actually installed in this browser first, then the
 * catalogue. Picking an installed wallet signs in headlessly; anything else
 * hands off to Privy's modal, which owns WalletConnect and the mobile flows.
 */

interface Option {
  readonly key: string;
  readonly name: string;
  readonly icon?: string;
  readonly wallet?: DetectedWallet;
}

export interface WalletPickerProps {
  readonly signIn: (wallet: DetectedWallet) => Promise<void>;
  readonly onOtherWallet: () => void;
  readonly onEmail: () => void;
  /** Injected by tests. Production discovers wallets itself. */
  readonly store?: WalletStore;
}

export function WalletPicker(props: WalletPickerProps) {
  const store = useMemo(() => props.store ?? detectWallets(), [props.store]);
  const [detected, setDetected] = useState<readonly DetectedWallet[]>(() => store.wallets);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => store.subscribe(() => setDetected(store.wallets)), [store]);

  const options = useMemo<readonly Option[]>(() => {
    const installed = new Set(detected.map((entry) => entry.name.toLowerCase()));
    const all: Option[] = [
      ...detected.map((entry) => ({
        key: entry.uuid,
        name: entry.name,
        icon: entry.icon,
        wallet: entry,
      })),
      ...WALLET_CATALOGUE.filter((entry) => !installed.has(entry.name.toLowerCase())).map(
        (entry) => ({ key: entry.id, name: entry.name }),
      ),
    ];
    const needle = query.trim().toLowerCase();
    if (needle === '') return all;
    return all.filter(
      (option) =>
        option.name.toLowerCase().includes(needle) ||
        (option.wallet?.rdns.toLowerCase().includes(needle) ?? false),
    );
  }, [detected, query]);

  async function choose(option: Option): Promise<void> {
    setError(null);
    if (option.wallet === undefined) {
      props.onOtherWallet();
      return;
    }
    setBusy(true);
    try {
      await props.signIn(option.wallet);
    } catch {
      // The underlying error may carry an address, a SIWE message, or a
      // signature. None of that belongs on screen or in a log.
      setError('Could not sign in with that wallet. Try again, or pick another.');
    } finally {
      setBusy(false);
    }
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      setQuery('');
      setActive(-1);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (options.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current + step + options.length) % options.length);
      return;
    }
    if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      const option = options[active];
      if (option !== undefined) void choose(option);
    }
  }

  const activeOption = active >= 0 ? options[active] : undefined;

  return (
    <section className="wallet-picker" aria-label="Choose a wallet">
      <h2>Operator sign-in</h2>
      <p className="gate-subtitle">
        The console reads authoritative payment state. Sign in to continue.
      </p>

      <input
        type="search"
        className="wallet-search"
        aria-label="Search wallets"
        aria-controls="wallet-list"
        {...(activeOption === undefined
          ? {}
          : { 'aria-activedescendant': `wallet-${activeOption.key}` })}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(-1);
        }}
        onKeyDown={onSearchKeyDown}
        placeholder="Search wallets"
      />

      {options.length === 0 ? (
        <p role="status" className="muted">
          No wallet matches “{query.trim()}”.
        </p>
      ) : (
        <ul id="wallet-list" className="wallet-list" role="listbox" aria-label="Wallets">
          {options.map((option, index) => (
            <li
              key={option.key}
              id={`wallet-${option.key}`}
              role="option"
              aria-selected={index === active}
              className="wallet-option"
              onClick={() => void choose(option)}
            >
              {option.icon !== undefined && <img src={option.icon} alt="" width="20" height="20" />}
              <span>{option.name}</span>
              {option.wallet === undefined && <small>Not installed</small>}
            </li>
          ))}
        </ul>
      )}

      {error !== null && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}

      <div className="wallet-actions">
        <button type="button" className="secondary" disabled={busy} onClick={props.onOtherWallet}>
          Other wallet
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={props.onEmail}>
          Continue with email
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oneshot/web test wallet-picker`
Expected: PASS, 7 tests.

The listbox is driven from the search box via `aria-activedescendant`, which is
the whole keyboard path. If the axe suite in `components.test.tsx` flags the
options, add `tabIndex={-1}` to each — never a second tab stop.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/WalletPicker.tsx apps/web/test/wallet-picker.test.tsx
git commit -m "feat(web): add a searchable wallet picker"
```

---

### Task 11: Sign in through Privy's headless SIWE flow

**Files:**

- Modify: `apps/web/src/auth/session.ts`
- Modify: `apps/web/src/auth/privy-session.tsx`
- Modify: `apps/web/src/components/LoginGate.tsx`
- Test: `apps/web/test/login-gate.test.tsx` (extend)

**Interfaces:**

- Consumes: `WalletPicker` from Task 10; `DetectedWallet` from Task 9.
- Produces: `OperatorSession` gains `readonly signInWithWallet?: (wallet: DetectedWallet) => Promise<void>`. `LoginGate` renders `WalletPicker` when the session offers one, and the existing Privy button when it does not.

- [ ] **Step 1: Write the failing test**

Append two cases to `apps/web/test/login-gate.test.tsx`, following the file's existing style:

```tsx
  it('offers the searchable picker when the session can sign in with a wallet', () => {
    const session = {
      status: 'SIGNED_OUT' as const,
      subject: null,
      accessToken: null,
      login: vi.fn(),
      logout: vi.fn(),
      signInWithWallet: vi.fn(async () => undefined),
    };
    render(
      <LoginGate session={session} machineToken="" onMachineTokenChange={() => undefined}>
        <p>console</p>
      </LoginGate>,
    );
    expect(screen.getByRole('searchbox', { name: /search wallets/iu })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign in with Privy' })).toBeNull();
  });

  it('keeps the plain Privy button when the session cannot', () => {
    const session = {
      status: 'SIGNED_OUT' as const,
      subject: null,
      accessToken: null,
      login: vi.fn(),
      logout: vi.fn(),
    };
    render(
      <LoginGate session={session} machineToken="" onMachineTokenChange={() => undefined}>
        <p>console</p>
      </LoginGate>,
    );
    expect(screen.getByRole('button', { name: 'Sign in with Privy' })).not.toBeNull();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oneshot/web test login-gate`
Expected: FAIL — no searchbox is rendered.

- [ ] **Step 3: Widen the session type**

In `apps/web/src/auth/session.ts`, add to the `OperatorSession` interface:

```ts
  /**
   * Present when the environment can sign a wallet in without Privy's modal.
   * Absent in the unconfigured session, which has no Privy client at all.
   */
  readonly signInWithWallet?: (wallet: DetectedWallet) => Promise<void>;
```

with `import type { DetectedWallet } from './eip6963.js';` at the top.

- [ ] **Step 4: Add the SIWE flow to the Privy session**

In `apps/web/src/auth/privy-session.tsx`:

```tsx
import { PrivyProvider, useLoginWithSiwe, usePrivy } from '@privy-io/react-auth';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import type { DetectedWallet } from './eip6963.js';

const ARC_TESTNET: `eip155:${number}` = 'eip155:5042002';
```

Inside `usePrivyOperatorSession`, beside the existing `usePrivy()` call:

```tsx
  const { generateSiweMessage, loginWithSiwe } = useLoginWithSiwe();

  const signInWithWallet = useCallback(
    async (wallet: DetectedWallet): Promise<void> => {
      const accounts = await wallet.provider.request({ method: 'eth_requestAccounts' });
      const address = Array.isArray(accounts) ? accounts[0] : undefined;
      if (typeof address !== 'string' || address.length === 0) {
        throw new Error('The wallet returned no account.');
      }
      const message = await generateSiweMessage({ address, chainId: ARC_TESTNET });
      const signature = await wallet.provider.request({
        method: 'personal_sign',
        params: [message, address],
      });
      if (typeof signature !== 'string') {
        throw new Error('The wallet returned no signature.');
      }
      await loginWithSiwe({
        signature,
        message,
        walletClientType: wallet.rdns,
        connectorType: 'injected',
      });
    },
    [generateSiweMessage, loginWithSiwe],
  );
```

Return `signInWithWallet` alongside the rest of the session object. Its thrown
errors are never logged: `WalletPicker` replaces them with its own sanitized
line, so nothing carrying an address or a signature reaches the screen.

Brand Privy's fallback modal in `PrivyOperatorProvider`'s config, beside
`loginMethods`:

```tsx
        appearance: {
          theme: '#0a0a0a',
          accentColor: '#00dc5f',
          walletList: ['detected_ethereum_wallets', 'wallet_connect'],
        },
```

These two literals are Privy's API surface, not our stylesheet — the guard in
`styles.test.ts` covers CSS only, and Privy's config takes hex strings.

- [ ] **Step 5: Render the picker from the gate**

In `apps/web/src/components/LoginGate.tsx`, add
`import { WalletPicker } from './WalletPicker.js';` and replace the
`gate-action-box` branch of the sign-in ternary with:

```tsx
          props.session.signInWithWallet !== undefined ? (
            <WalletPicker
              signIn={props.session.signInWithWallet}
              onOtherWallet={() => props.session.login()}
              onEmail={() => props.session.login()}
            />
          ) : (
            <div className="gate-action-box">
              <h2>Operator sign-in</h2>
              <p className="gate-subtitle">
                The console reads authoritative payment state. Sign in to continue.
              </p>
              <button type="button" className="btn-privy" onClick={() => props.session.login()}>
                Sign in with Privy
              </button>
            </div>
          )
```

Both fallbacks call the same `login()`. Narrowing the email path would need
`login({ loginMethods: ['email'] })`, which `OperatorSession['login']` does not
accept — widening that signature for one flag is churn the picker does not need.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @oneshot/web test login-gate`
Expected: PASS, including the file's existing cases.

- [ ] **Step 7: Run every web suite and commit**

Run: `pnpm --filter @oneshot/web test`

```bash
git add apps/web/src/auth apps/web/src/components/LoginGate.tsx apps/web/test/login-gate.test.tsx
git commit -m "feat(web): sign in through Privy's headless SIWE flow"
```

---

### Task 12: Whole-repository verification and documentation

**Files:**

- Modify: `apps/web/README.md`
- Modify: `.agent/context/20260910T155019Z-brand-frontend.md`

**Interfaces:**

- Consumes: everything above.
- Produces: the evidence Gate A needs.

- [ ] **Step 1: Run the full local gate**

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

Expected: all pass. `pnpm test` runs `pnpm build` first, so a stale `dist` in the
new brand package fails loudly rather than silently.

- [ ] **Step 2: Run the browser gate**

Run: `pnpm --filter @oneshot/web test:browser`
Expected: the P5 Playwright spec passes. It drives the console by role and text,
so the repaint should not move it. Where a selector genuinely broke, fix the
test's selector only if the accessible name really changed — never by re-adding
a class the design dropped.

- [ ] **Step 3: Check nothing reintroduced a literal colour**

```bash
grep -rn "#[0-9a-fA-F]\{6\}" apps/web/src packages/settlement-ui/src packages/recovery-ui/src \
  --include='*.css' --include='*.ts' --include='*.tsx'
```

Expected: exactly two lines, both in `apps/web/src/auth/privy-session.tsx` —
`theme: '#0a0a0a'` and `accentColor: '#00dc5f'`. Those are Privy's config API,
which takes hex strings, and are the known exception from Task 11, Step 4.
Anything else is a literal that belongs in `packages/brand/src/tokens.css`.

- [ ] **Step 4: Document the package**

Add to `apps/web/README.md`:

```markdown
## Brand

The palette, the commit-ring mark, and the hero geometry come from
`@oneshot/brand`. `packages/brand/src/tokens.css` is the only file in the
repository allowed to hold a colour; `apps/web/test/styles.test.ts` fails the
build if a literal appears in this app's stylesheet instead.

The theme is `data-theme` on `<html>`, dark by default, stamped before first
paint by the inline guard in `index.html`. That guard duplicates `src/theme.ts`
deliberately — it has to run before the bundle does. Change one and change the
other, or the page flashes the wrong palette on load.
```

- [ ] **Step 5: Update the context record**

Fill in `Commands/checks`, `Files/components touched`, and `Git and PR state` in
`.agent/context/20260910T155019Z-brand-frontend.md` with the actual results and
the head SHA. Leave Gate A and Gate B as `NOT RUN` until they run.

- [ ] **Step 6: Commit**

```bash
git add apps/web/README.md .agent/context/20260910T155019Z-brand-frontend.md
git commit -m "docs(web): document the brand package and the theme guard"
```

- [ ] **Step 7: Hand off to the implementation loop**

Follow `.agent/IMPLEMENTATION_LOOP.md` from section 3: capture the immutable
Gate A evidence, run FreePi Gate A in a fresh read-only process, push, open the
draft PR against `develop`, wait for required CI, then run Gate B against the
exact head SHA. Never merge — a human does that.

---

## Notes for the implementer

**The attempt arcs are decorative.** At `#4a7a60` on `#0b332c` they sit at
2.78:1, under the 3:1 non-text contrast would want. That is deliberate: they are
texture, the mark carries its accessible name on the `<svg>`, and the reduced cut
drops them entirely. Do not "fix" it by lightening the token — that breaks the
canvas parity the whole palette rests on.

**Signal green is a fill, not body text.** On the light ground it sits at
1.72:1. It is legal as a pill background with `--os-on-signal` text on it, and as
text on `--os-panel`. `AUDITED_PAIRS` encodes exactly those pairs; adding a pair
without checking the ratio first will fail the build, which is the point.

**The diagonal appears once.** If a second one shows up in a card, a modal, or an
empty state, the brand rule has been broken — remove it rather than tuning it.
