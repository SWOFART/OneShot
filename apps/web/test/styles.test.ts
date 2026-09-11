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

  it('sets the page ground and primary type from tokens', async () => {
    const css = await readFile(stylesheet, 'utf8');
    expect(css).toMatch(/body\s*\{[^}]*background:\s*var\(--os-ground\)/u);
    expect(css).toMatch(/body\s*\{[^}]*font-family:\s*var\(--os-font-primary\)/u);
    expect(css).toMatch(/body\s*\{[^}]*font-weight:\s*300/u);
  });
});
