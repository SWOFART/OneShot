## Summary

<!-- What changed and why? Keep this concise. -->

## Scope and acceptance criteria

- [ ] The change is limited to the stated milestone or issue.
- [ ] Acceptance criteria are listed and satisfied.
- [ ] No unrelated cleanup is included.

## Product and security invariants

- [ ] Tenant isolation remains fail-closed.
- [ ] Sponsor authorization, auditability, and daily caps remain enforced where applicable.
- [ ] Recipients cannot modify sponsor controls or access sponsor-only data.
- [ ] No secret, token, production identifier, or personal data is committed or pasted into review prompts.
- [ ] Any non-applicable invariant is explained below.

Invariant notes:

<!-- Explain affected invariants, or why they are not applicable. -->

## Validation

Commands and results:

```text
<!-- command: PASS/FAIL and concise evidence -->
```

## Independent review evidence

### Gate A — exact candidate tree before push

- Base commit SHA:
- Candidate tree SHA:
- Candidate commit SHA (if already committed but unpushed):
- Reviewer tool: `free-pi-cli`
- Reviewer model:
- Verdict: `VERDICT: PASS` / `VERDICT: FAIL`
- Findings or residual risks:

- [ ] The reviewed tree equals the committed tree.

### Gate B — exact remote PR head

- Pull request URL/number:
- Remote head commit SHA:
- Remote head tree SHA:
- Reviewer tool: `free-pi-cli`
- Reviewer model:
- Verdict: `VERDICT: PASS` / `VERDICT: FAIL`
- Findings or residual risks:

- [ ] Gate B reviewed the current remote head and matches Gate A's approved tree, or a fresh Gate A was run for the changed tree.
- [ ] `Agent policy / repository-policy` and all applicable CI checks pass.

## Risk and rollback

- Residual risks:
- Rollback or recovery plan:

## Human merge

- [ ] A human owner has reviewed the evidence and will perform the merge.
