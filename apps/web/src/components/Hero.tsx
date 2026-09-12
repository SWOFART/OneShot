import { HERO_MIN_WIDTH, heroClipPaths } from '@oneshot/brand';
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The hero, and the only diagonal cut in the product.
 *
 * The two shapes are clipped, not drawn, so the copy over them stays real text.
 * Rounding the acute corners needs `clipPathUnits="userSpaceOnUse"`, which
 * means real pixels — hence the measurement. Narrow viewports lose the cut
 * entirely: below the minimum width the acute corners collapse into a smudge,
 * so the hero becomes the same content on a plain rounded panel.
 */

/**
 * Floor for the cut's height. The copy sits in normal flow and sets the real
 * height, so a long headline grows the hero instead of overflowing it — which
 * is what clipped the lead paragraph at narrow desktop widths, and what made
 * the clipping differ between monitors. jsdom reports zero for every layout
 * box, so this floor is also the height the Hero tests measure against.
 */
const HERO_MIN_HEIGHT = 268;

export function Hero({
  children,
  height = HERO_HEIGHT,
}: {
  readonly children: ReactNode;
  readonly height?: number;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(HERO_MIN_HEIGHT);
  const id = useId();

  // `useLayoutEffect`, not `useEffect`: this app is pure client-side render
  // (see `src/main.tsx`, no SSR), so the synchronous flush happens before the
  // browser paints. `useEffect` fires after paint, which meant every desktop
  // load painted `.hero-plain` for one frame and then flashed to `.hero-cut`.
  // Measuring synchronously here removes that flash. The `ResizeObserver`
  // wiring for subsequent resizes is unchanged.
  useLayoutEffect(() => {
    const element = box.current;
    if (element === null) return;

    const measure = (): void => {
      setWidth(element.clientWidth);
      // The clip only paints; it never changes layout, so feeding the measured
      // height back in cannot loop the observer.
      setHeight(Math.max(HERO_MIN_HEIGHT, element.clientHeight));
    };
    measure();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const cut = width >= HERO_MIN_WIDTH ? heroClipPaths(width, height) : null;
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
        <div className="hero-cut" style={{ height: `${height}px` }}>
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
