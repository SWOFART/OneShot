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
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
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

    // The settlement box paints --os-panel inside `.job-list li`, which rebinds
    // --os-accent-ink to the page ink for the card around it. Without its own
    // rebind, the ArcScan link was forest ink on the forest box: invisible in
    // the light theme, correct in the dark one.
    expect(css).toMatch(
      /\.job-settlement-summary \{[^}]*--os-accent-ink:\s*var\(--os-state-committed\)/u,
    );
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

  /**
   * A rule whose class nothing renders is not a fix, it is decoration.
   *
   * This branch merged develop's redesigned `JobWorkspace.tsx` wholesale and
   * silently took back `<section className="panel">`, dropping the
   * `paid-api-panel` class the grid rules depend on. The stylesheet still said
   * the right thing, so the text assertions above passed, lint and typecheck
   * passed, 1064 unit tests and 8 browser tests passed, and CI went green on a
   * tree where two of the requested fixes did not apply at all. Nothing checked
   * that any element wore the class.
   */
  it('defines no class that no component renders', async () => {
    const css = await readFile(stylesheet, 'utf8');
    const componentRoot = fileURLToPath(new URL('../src', import.meta.url));

    async function sources(directory: string): Promise<readonly string[]> {
      const entries = await readdir(directory, { withFileTypes: true });
      const found = await Promise.all(
        entries.map(async (entry) => {
          const full = join(directory, entry.name);
          if (entry.isDirectory()) return sources(full);
          return /\.tsx?$/u.test(entry.name) ? [full] : [];
        }),
      );
      return found.flat();
    }

    const markup = (
      await Promise.all((await sources(componentRoot)).map((file) => readFile(file, 'utf8')))
    ).join('\n');

    // Classes the read-only slices also declare are rendered by their own
    // components, outside this app's tree.
    const sliceCss = (
      await Promise.all(
        (['recovery-ui', 'settlement-ui'] as const).map((slice) =>
          readFile(
            fileURLToPath(new URL(`../../../packages/${slice}/src/styles.css`, import.meta.url)),
            'utf8',
          ),
        ),
      )
    ).join('\n');

    const classesIn = (text: string): ReadonlySet<string> =>
      new Set(
        [...text.matchAll(/(?:^|[\s,>+~(])\.([a-z][a-z0-9-]*)/gmu)]
          .map((match) => match[1] ?? '')
          .filter((name) => name.length > 0),
      );

    // `className={`state-card state-${x}`}` renders a name no source file
    // spells out. Collect the literal prefixes that precede an interpolation
    // and treat anything built from one as rendered.
    const dynamicPrefixes = [...markup.matchAll(/([a-z][a-z0-9-]*-)\$\{/gu)].map(
      (match) => match[1] ?? '',
    );

    /**
     * Dead before this branch and left alone: removing them means touching
     * rules this change has no other reason to touch. Worth a separate
     * cleanup; listed here so the guard ratchets rather than blocks.
     */
    const KNOWN_DEAD = new Set([
      'brand-logo',
      'fixture-toolbar',
      'meta-code',
      'workspace-fact-grid',
    ]);

    const external = classesIn(sliceCss);
    const orphans = [...classesIn(css)]
      .filter((name) => !external.has(name) && !KNOWN_DEAD.has(name))
      .filter((name) => !markup.includes(name))
      .filter((name) => !dynamicPrefixes.some((prefix) => name.startsWith(prefix)))
      .sort();

    expect(orphans).toEqual([]);
  });

  it('sets the page ground and primary type from tokens', async () => {
    const css = await readFile(stylesheet, 'utf8');
    expect(css).toMatch(/body\s*\{[^}]*background:\s*var\(--os-ground\)/u);
    expect(css).toMatch(/body\s*\{[^}]*font-family:\s*var\(--os-font-primary\)/u);
    expect(css).toMatch(/body\s*\{[^}]*font-weight:\s*300/u);
  });
});
