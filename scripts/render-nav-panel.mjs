/**
 * Renders the README banner from the product's own front-end source.
 *
 * The banner is the brand lock-up of `apps/web`'s `.top-nav` — the commit-ring
 * mark beside the wordmark and its `SETTLEMENT ENGINE` tag — on the same
 * rounded panel, sized for a README rather than for a full-width nav. Nothing
 * here is redrawn by hand: the palette comes from
 * `packages/brand/src/tokens.css`, the mark geometry from
 * `packages/brand/src/CommitRing.tsx`, and the labels from
 * `apps/web/src/App.tsx`, so the README cannot drift from the shipped UI
 * without this script failing or producing a visibly different banner.
 *
 * GitHub strips CSS from Markdown, so the banner ships as two static SVGs (one
 * per theme) selected by a `<picture>` element in the README.
 *
 *   node scripts/render-nav-panel.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const out = (path) => fileURLToPath(new URL(path, root));

/**
 * The nav renders the mark at 36px. A banner that has to survive GitHub's
 * column width needs it larger, so every length below is the CSS value scaled
 * by this one factor — the proportions stay exactly those of `.top-nav`.
 */
const SCALE = 64 / 36;

/** Geometry mirrored from `apps/web/src/styles.css`, in px at a 16px root. */
const CSS = {
  paddingX: 20, // .top-nav padding-inline 1.25rem
  paddingY: 13.6, // .top-nav padding-block 0.85rem
  radius: 22, // --os-radius-lg
  ring: 36, // <CommitRing size={36} />
  brandGap: 12, // .brand-group gap 0.75rem
  brandTextGap: 1.6, // .brand-text gap 0.1rem
  nameSize: 16, // .brand-name 1rem
  nameTracking: 1.6, // .brand-name letter-spacing 0.1em
  tagSize: 10.4, // .brand-tag 0.65rem
  tagTracking: 1.248, // .brand-tag letter-spacing 0.12em
};

const B = Object.fromEntries(Object.entries(CSS).map(([key, value]) => [key, value * SCALE]));

/**
 * Pulls one selector's `--os-*` declarations out of the token sheet. Values
 * are kept verbatim, so `rgba()` lines survive alongside the hex ones.
 */
function readTheme(css, selector) {
  const block = new RegExp(`${selector}\\s*\\{([^}]*)\\}`, 'u').exec(css)?.[1];
  if (block === undefined) throw new Error(`missing token block for ${selector}`);
  const tokens = {};
  for (const match of block.matchAll(/--os-([a-z-]+):\s*([^;]+);/gu)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) tokens[name] = value.trim();
  }
  return tokens;
}

/** Extracts the commit-ring arc geometry from the component source. */
function readArcs(source) {
  const attempts = [
    ...(/const ATTEMPT_ARCS[\s\S]*?=\s*\[([\s\S]*?)\];/u.exec(source)?.[1] ?? '').matchAll(
      /'([^']+)'/gu,
    ),
  ].map((match) => match[1]);
  const committed = /const COMMITTED_ARC\s*=\s*'([^']+)'/u.exec(source)?.[1];
  if (attempts.length === 0 || committed === undefined) {
    throw new Error('could not read commit-ring geometry from CommitRing.tsx');
  }
  return { attempts, committed };
}

/** Reads the wordmark and its tag from the landing nav. */
function readLabels(app) {
  const pick = (className) =>
    new RegExp(`className="${className}">([^<]+)<`, 'u').exec(app)?.[1]?.trim();
  const name = pick('brand-name');
  const tag = pick('brand-tag');
  if (name === undefined || tag === undefined) {
    throw new Error('could not read brand labels from App.tsx');
  }
  return { name, tag };
}

/**
 * Advance width estimate. Rubik and the mono fallback are not measurable here,
 * so the panel is sized from per-family averages plus the tracking the CSS
 * asks for. A fraction of a pixel of slack at the panel edge is invisible.
 */
function advance(text, size, tracking = 0, mono = false) {
  return text.length * size * (mono ? 0.6 : 0.54) + Math.max(text.length - 1, 0) * tracking;
}

const escape = (text) => text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');

function banner(theme, arcs, labels) {
  const height = Math.round(B.paddingY * 2 + B.ring);
  const textX = B.paddingX + B.ring + B.brandGap;
  const textWidth = Math.max(
    advance(labels.name, B.nameSize, B.nameTracking),
    advance(labels.tag, B.tagSize, B.tagTracking, true),
  );
  const width = Math.round(textX + textWidth + B.paddingX);

  // `.brand-text` is a centred column of two lines.
  const stack = B.nameSize * 1.2 + B.brandTextGap + B.tagSize * 1.2;
  const stackTop = (height - stack) / 2;
  const nameBaseline = stackTop + B.nameSize * 0.95;
  const tagBaseline = stackTop + B.nameSize * 1.2 + B.brandTextGap + B.tagSize * 0.95;

  const ringScale = B.ring / 64;
  const attempts = arcs.attempts
    .map(
      (d) =>
        `      <path d="${d}" fill="none" stroke="${theme.attempt}" stroke-width="4.6" stroke-linecap="round" />`,
    )
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(labels.name)} — ${escape(labels.tag.toLowerCase())}">
  <title>${escape(labels.name)} — ${escape(labels.tag.toLowerCase())}</title>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="${B.radius.toFixed(1)}" fill="${theme.surface}" stroke="${theme.line}" />
  <g transform="translate(${B.paddingX.toFixed(1)} ${((height - B.ring) / 2).toFixed(1)}) scale(${ringScale.toFixed(4)})">
    <rect width="64" height="64" rx="19" fill="${theme.panel}" />
    <g transform="translate(10 10) scale(0.6875)">
${attempts}
      <path d="${arcs.committed}" fill="none" stroke="${theme.signal}" stroke-width="6.4" stroke-linecap="round" />
      <circle cx="41.96" cy="20.13" r="5.6" fill="${theme.signal}" />
    </g>
  </g>
  <text x="${textX.toFixed(1)}" y="${nameBaseline.toFixed(1)}" font-family="${theme['font-primary']}" font-size="${B.nameSize.toFixed(1)}" font-weight="300" letter-spacing="${B.nameTracking.toFixed(2)}" fill="${theme.ink}">${escape(labels.name)}</text>
  <text x="${textX.toFixed(1)}" y="${tagBaseline.toFixed(1)}" font-family="${theme['font-mono']}" font-size="${B.tagSize.toFixed(1)}" font-weight="300" letter-spacing="${B.tagTracking.toFixed(2)}" fill="${theme['accent-ink']}">${escape(labels.tag)}</text>
</svg>
`;
}

const tokensCss = await read('packages/brand/src/tokens.css');
const light = readTheme(tokensCss, ':root');
const dark = { ...light, ...readTheme(tokensCss, ":root\\[data-theme='dark'\\]") };
const arcs = readArcs(await read('packages/brand/src/CommitRing.tsx'));
const labels = readLabels(await read('apps/web/src/App.tsx'));

await writeFile(out('docs/assets/nav-panel-light.svg'), banner(light, arcs, labels), 'utf8');
await writeFile(out('docs/assets/nav-panel-dark.svg'), banner(dark, arcs, labels), 'utf8');
console.log('wrote docs/assets/nav-panel-{light,dark}.svg');
