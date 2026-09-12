// @vitest-environment node
//
// This suite only reads apps/web/src/styles.css off disk and inspects the
// text — it needs no DOM. Forcing node here (instead of the project-wide
// jsdom default) matters for a subtler reason: under jsdom, Vite's asset
// pipeline treats `new URL('../src/styles.css', import.meta.url)` as a
// browser asset reference and rewrites it to a served dev-server URL
// (`http://localhost:.../src/styles.css`), which is not a file:// URL and
// makes `fileURLToPath` throw before any assertion runs. Under node, Vite's
// SSR transform leaves import.meta.url alone and the URL resolves to the
// real file on disk, exactly as this test intends.
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

  it('imports the brand fonts and tokens as the first two statements, in order, with nothing between them', async () => {
    const css = await readFile(stylesheet, 'utf8');
    // Anchored at the start of the file and joined by only whitespace, so a
    // rule sneaking in between the two imports (which CSS silently ignores,
    // disabling the token layer) fails this assertion.
    expect(css).toMatch(
      /^@import '@oneshot\/brand\/fonts\.css';\s*@import '@oneshot\/brand\/tokens\.css';/u,
    );
  });

  /**
   * Both themes once shipped unreadable text, from the same mistake in
   * opposite directions: an ink chosen for a surface that never flips used on
   * one that does, and the reverse.
   *
   * --os-panel and --os-field are the same colour in light and dark, so they
   * carry their own fixed inks (--os-panel-ink, --os-on-field). --os-ink and
   * --os-ground flip together with the theme. Pairing one family's ink with
   * the other family's surface is invisible in exactly one of the two themes,
   * which is why neither slipped past review.
   */
  it('pairs each surface with the ink family that belongs to it', async () => {
    const css = await readFile(stylesheet, 'utf8');

    // The tab strip sits on the page ground, so it flips with the theme.
    // --os-panel-ink here rendered near-white on the near-white light ground.
    // Anchored: `.console-container .tabs button` legitimately takes panel ink,
    // because that container paints --os-panel.
    expect(css).toMatch(/^\.tabs button \{[^}]*color:\s*var\(--os-ink\)/mu);
    expect(css).not.toMatch(/^\.tabs button \{[^}]*color:\s*var\(--os-panel-ink\)/mu);

    // The hero copy sits on --os-panel, which is forest in both themes.
    expect(css).toMatch(/\.hero-copy,\s*\.hero-plain \{[^}]*color:\s*var\(--os-panel-ink\)/u);

    // The paid-API summary sits on the lime --os-field and rebinds the ink
    // tokens its descendants inherit.
    expect(css).toMatch(/\.paid-api-status \{[^}]*--os-panel-ink:\s*var\(--os-on-field\)/u);
  });

  /**
   * The structural form of the rule above, so the whole class is caught rather
   * than the instances that happened to be reported.
   *
   * --os-ground and --os-surface flip between light and dark; --os-panel and
   * --os-field do not, and carry their own fixed inks. A fixed ink on a
   * flipping surface is invisible in exactly one theme, so it survives any
   * review done in the other one — which is how several shipped together.
   */
  it('never puts a fixed ink on a surface that flips with the theme', async () => {
    const css = await readFile(stylesheet, 'utf8');

    const FLIPPING = new Set(['--os-ground', '--os-surface']);
    const FIXED_INK = new Set([
      '--os-panel-ink',
      '--os-panel-ink-muted',
      '--os-on-field',
      '--os-on-field-muted',
    ]);

    const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/gu)].flatMap(([, rawSelector, body]) =>
      (rawSelector ?? '')
        .split(',')
        .map((part) => part.trim().split('\n').at(-1)?.trim() ?? '')
        .filter((selector) => selector.length > 0 && !selector.startsWith('@'))
        .map((selector) => ({ selector, body: body ?? '' })),
    );

    // Which surface each selector paints, for the ones that paint at all.
    const surfaceOf = new Map<string, string>();
    for (const { selector, body } of rules) {
      const background = /background(?:-color)?:\s*var\((--os-[\w-]+)\)/u.exec(body)?.[1];
      if (background !== undefined) surfaceOf.set(selector, background);
    }

    /** The nearest self-or-ancestor selector that actually paints a surface. */
    function surfaceUnder(selector: string): string | undefined {
      const stripped = selector.replace(/\[[^\]]*\]|:{1,2}[\w-]+(\([^)]*\))?/gu, '');
      for (const candidate of [selector, stripped]) {
        const parts = candidate.trim().split(/\s+/u);
        for (let index = parts.length; index > 0; index -= 1) {
          const ancestor = parts
            .slice(0, index)
            .join(' ')
            .replace(/\s*>\s*$/u, '')
            .trim();
          const found = surfaceOf.get(ancestor);
          if (found !== undefined) return found;
        }
      }
      return undefined;
    }

    const mismatches: string[] = [];
    for (const { selector, body } of rules) {
      const ink = /(?:^|[;{\s])color:\s*var\((--os-[\w-]+)\)/u.exec(body)?.[1];
      if (ink === undefined || !FIXED_INK.has(ink)) continue;
      const surface = surfaceUnder(selector);
      if (surface !== undefined && FLIPPING.has(surface)) {
        mismatches.push(`${selector} sets ${ink} on ${surface}`);
      }
    }

    expect(mismatches).toEqual([]);
  });

  it('sets the page ground and primary type from tokens', async () => {
    const css = await readFile(stylesheet, 'utf8');
    expect(css).toMatch(/body\s*\{[^}]*background:\s*var\(--os-ground\)/u);
    expect(css).toMatch(/body\s*\{[^}]*font-family:\s*var\(--os-font-primary\)/u);
    expect(css).toMatch(/body\s*\{[^}]*font-weight:\s*300/u);
  });
});
