## Summary

<!-- What changed and why? Link the issue when one exists. -->

## Scope and acceptance criteria

- [ ] The change is limited to the linked issue or the stated outcome.
- [ ] Acceptance criteria are listed and satisfied.
- [ ] No unrelated cleanup is included.

## Product and security invariants

- [ ] One business intent still has at most one committed settlement.
- [ ] An `UNKNOWN` outcome is reconciled before any further payment attempt.
- [ ] Money remains integer atomic units.
- [ ] No secret, token, production identifier, or personal data is committed.
- [ ] Testnet remains the default unless this change has explicit authorization for another network.
- [ ] Any non-applicable invariant is explained below.

Invariant notes:

<!-- Explain affected invariants, or why they are not applicable. -->

## Validation

Commands and results:

```text
<!-- command: PASS/FAIL and concise evidence -->
```

## Risk and rollback

- Residual risks:
- Rollback or recovery plan:

## Human merge

- [ ] Required CI is green on this head.
- [ ] A human owner has reviewed the change and will perform the merge.
