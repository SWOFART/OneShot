# @oneshot/brand

Brand tokens, the commit-ring mark, and the hero geometry.

`src/tokens.css` is the only file in the repository that holds a brand colour.
`apps/web`, `@oneshot/settlement-ui`, and `@oneshot/recovery-ui` all read the
`--os-*` custom properties it defines. The audit in `test/tokens.test.ts`
computes WCAG ratios over both themes, so a palette edit that drops below AA
fails in CI rather than in review.

The diagonal hero cut is derived by `heroClipPaths` and belongs to the hero
only. Every other surface in the product is a plain rounded rectangle.
