/**
 * Renders the README banner from the product's own front-end source.
 *
 * The banner is the `.top-nav` panel of `apps/web` — the commit-ring mark, the
 * wordmark, the network and token badges, the theme control, and the workspace
 * link. Nothing here is redrawn by hand: the palette is read from
 * `packages/brand/src/tokens.css`, the ring geometry from
 * `packages/brand/src/CommitRing.tsx`, and the nav labels from
 * `apps/web/src/App.tsx`, so the README cannot drift from the shipped UI
 * without this script failing or producing a visibly different panel.
 *
 * GitHub strips CSS from Markdown, so the panel ships as two static SVGs (one
 * per theme) selected by a `<picture>` element in the README.
 *
 *   node scripts/render-nav-panel.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const out = (path) => fileURLToPath(new URL(path, root));

/** Geometry mirrored from `apps/web/src/styles.css`, in px at a 16px root. */
const NAV = {
  width: 1000,
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
  statusGap: 9.6, // .nav-status-group gap 0.6rem
  badgeSize: 12, // .status-badge 0.75rem
  badgePadX: 12, // .status-badge padding-inline 0.75rem
  badgeHeight: 24, // 0.3rem block padding around a 12px line
  badgeContentGap: 7.2, // .status-badge gap 0.45rem
  dot: 7, // .status-dot
  toggleSize: 12.48, // .theme-toggle 0.78rem
  toggleTracking: 1.248, // .theme-toggle letter-spacing 0.1em
  togglePadX: 14.4, // .theme-toggle padding-inline 0.9rem
  toggleHeight: 34, // .theme-toggle min-height
  linkSize: 12.8, // .nav-console-link 0.8rem
  linkPadX: 16, // .nav-console-link padding-inline 1rem
  linkHeight: 30, // 0.45rem block padding around a 12.8px line
};

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

/** Extracts a quoted string list or single literal from a source file. */
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

/** Reads the nav labels from the landing page so the banner cannot drift. */
function readLabels(app) {
  const pick = (className) =>
    new RegExp(`className="${className}">([^<]+)<`, 'u').exec(app)?.[1]?.trim();
  const name = pick('brand-name');
  const tag = pick('brand-tag');
  if (name === undefined || tag === undefined) {
    throw new Error('could not read brand labels from App.tsx');
  }
  const network = /className="status-badge network-badge">[\s\S]*?\/>\s*([A-Za-z ]+)\s*</u
    .exec(app)?.[1]
    ?.trim();
  const token = /className="status-badge token-badge">([^<]+)</u.exec(app)?.[1]?.trim();
  const link = /className="nav-console-link" href="\/app">\s*([^<]+?)\s*</u.exec(app)?.[1];
  if (network === undefined || token === undefined || link === undefined) {
    throw new Error('could not read nav labels from App.tsx');
  }
  // `.theme-toggle` renders the theme it switches to, uppercased by CSS.
  return { name, tag, network, token, link };
}

/**
 * Advance width estimate. Rubik and the mono fallback are not measurable here,
 * so the pills are sized from per-family averages plus the tracking the CSS
 * asks for. A few tenths of a pixel of slack in a pill is invisible.
 */
function advance(text, size, tracking = 0, mono = false) {
  return text.length * size * (mono ? 0.6 : 0.54) + Math.max(text.length - 1, 0) * tracking;
}

const escape = (text) => text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');

function panel(theme, arcs, labels) {
  const height = Math.round(NAV.paddingY * 2 + NAV.ring);
  const middle = height / 2;
  const sans = theme['font-primary'];
  const mono = theme['font-mono'];

  // Brand group, left-aligned inside the panel padding.
  const ringY = (height - NAV.ring) / 2;
  const textX = NAV.paddingX + NAV.ring + NAV.brandGap;
  const stack = NAV.nameSize * 1.2 + NAV.brandTextGap + NAV.tagSize * 1.2;
  const stackTop = (height - stack) / 2;
  const nameBaseline = stackTop + NAV.nameSize * 0.95;
  const tagBaseline = stackTop + NAV.nameSize * 1.2 + NAV.brandTextGap + NAV.tagSize * 0.95;

  // Status group, centred like the flex row that holds it.
  const networkWidth =
    NAV.badgePadX * 2 + NAV.dot + NAV.badgeContentGap + advance(labels.network, NAV.badgeSize);
  const tokenWidth = NAV.badgePadX * 2 + advance(labels.token, NAV.badgeSize, 0, true);
  const toggleLabel = 'Light theme'.toUpperCase();
  const toggleWidth = NAV.togglePadX * 2 + advance(toggleLabel, NAV.toggleSize, NAV.toggleTracking);
  const statusWidth = networkWidth + tokenWidth + toggleWidth + NAV.statusGap * 2;
  const statusX = (NAV.width - statusWidth) / 2;
  const tokenX = statusX + networkWidth + NAV.statusGap;
  const toggleX = tokenX + tokenWidth + NAV.statusGap;

  // Workspace link, right-aligned against the panel padding.
  const linkWidth = NAV.linkPadX * 2 + advance(labels.link, NAV.linkSize);
  const linkX = NAV.width - NAV.paddingX - linkWidth;

  const ringScale = NAV.ring / 64;
  const attempts = arcs.attempts
    .map(
      (d) =>
        `      <path d="${d}" fill="none" stroke="${theme.attempt}" stroke-width="4.6" stroke-linecap="round" />`,
    )
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${NAV.width}" height="${height}" viewBox="0 0 ${NAV.width} ${height}" role="img" aria-label="OneShot settlement engine — Arc Testnet, USDC, open workspace">
  <title>OneShot — settlement engine</title>
  <rect x="0.5" y="0.5" width="${NAV.width - 1}" height="${height - 1}" rx="${NAV.radius}" fill="${theme.surface}" stroke="${theme.line}" />
  <g transform="translate(${NAV.paddingX} ${ringY}) scale(${ringScale})">
    <rect width="64" height="64" rx="19" fill="${theme.panel}" />
    <g transform="translate(10 10) scale(0.6875)">
${attempts}
      <path d="${arcs.committed}" fill="none" stroke="${theme.signal}" stroke-width="6.4" stroke-linecap="round" />
      <circle cx="41.96" cy="20.13" r="5.6" fill="${theme.signal}" />
    </g>
  </g>
  <text x="${textX}" y="${nameBaseline.toFixed(1)}" font-family="${sans}" font-size="${NAV.nameSize}" font-weight="300" letter-spacing="${NAV.nameTracking}" fill="${theme.ink}">${escape(labels.name)}</text>
  <text x="${textX}" y="${tagBaseline.toFixed(1)}" font-family="${mono}" font-size="${NAV.tagSize}" font-weight="300" letter-spacing="${NAV.tagTracking}" fill="${theme['accent-ink']}">${escape(labels.tag)}</text>
  <g>
    <rect x="${statusX.toFixed(1)}" y="${middle - NAV.badgeHeight / 2}" width="${networkWidth.toFixed(1)}" height="${NAV.badgeHeight}" rx="${NAV.badgeHeight / 2}" fill="none" stroke="${theme.line}" />
    <circle cx="${(statusX + NAV.badgePadX + NAV.dot / 2).toFixed(1)}" cy="${middle}" r="${NAV.dot / 2}" fill="${theme['state-committed']}" />
    <text x="${(statusX + NAV.badgePadX + NAV.dot + NAV.badgeContentGap).toFixed(1)}" y="${middle + NAV.badgeSize * 0.35}" font-family="${sans}" font-size="${NAV.badgeSize}" font-weight="300" fill="${theme.ink}">${escape(labels.network)}</text>
    <rect x="${tokenX.toFixed(1)}" y="${middle - NAV.badgeHeight / 2}" width="${tokenWidth.toFixed(1)}" height="${NAV.badgeHeight}" rx="${NAV.badgeHeight / 2}" fill="none" stroke="${theme['accent-ink']}" />
    <text x="${(tokenX + NAV.badgePadX).toFixed(1)}" y="${middle + NAV.badgeSize * 0.35}" font-family="${mono}" font-size="${NAV.badgeSize}" font-weight="300" fill="${theme['accent-ink']}">${escape(labels.token)}</text>
    <rect x="${toggleX.toFixed(1)}" y="${middle - NAV.toggleHeight / 2}" width="${toggleWidth.toFixed(1)}" height="${NAV.toggleHeight}" rx="${NAV.toggleHeight / 2}" fill="none" stroke="${theme['line-strong']}" />
    <text x="${(toggleX + NAV.togglePadX).toFixed(1)}" y="${middle + NAV.toggleSize * 0.35}" font-family="${sans}" font-size="${NAV.toggleSize}" font-weight="300" letter-spacing="${NAV.toggleTracking}" fill="${theme.ink}">${escape(toggleLabel)}</text>
  </g>
  <rect x="${linkX.toFixed(1)}" y="${middle - NAV.linkHeight / 2}" width="${linkWidth.toFixed(1)}" height="${NAV.linkHeight}" rx="${NAV.linkHeight / 2}" fill="none" stroke="${theme.line}" />
  <text x="${(linkX + NAV.linkPadX).toFixed(1)}" y="${middle + NAV.linkSize * 0.35}" font-family="${sans}" font-size="${NAV.linkSize}" font-weight="300" fill="${theme.ink}">${escape(labels.link)}</text>
</svg>
`;
}

const tokensCss = await read('packages/brand/src/tokens.css');
const light = readTheme(tokensCss, ':root');
const dark = { ...light, ...readTheme(tokensCss, ":root\\[data-theme='dark'\\]") };
const arcs = readArcs(await read('packages/brand/src/CommitRing.tsx'));
const labels = readLabels(await read('apps/web/src/App.tsx'));

await writeFile(out('docs/assets/nav-panel-light.svg'), panel(light, arcs, labels), 'utf8');
await writeFile(out('docs/assets/nav-panel-dark.svg'), panel(dark, arcs, labels), 'utf8');
console.log('wrote docs/assets/nav-panel-{light,dark}.svg');
