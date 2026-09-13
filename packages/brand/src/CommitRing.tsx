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
