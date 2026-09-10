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
