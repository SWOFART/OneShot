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
