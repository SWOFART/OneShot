## Outcome

<!-- What focused outcome does this PR deliver? -->

## Scope

### In scope

-

### Out of scope

-

## Acceptance criteria

- [ ]

## OneShot invariant impact

- Business Intent / Attempt / Settlement impact:
- `business_intent_id` stability:
- `UNKNOWN` reconciliation behavior:
- Concurrency and duplicate-settlement protection:
- Money representation:

## Sponsor impact

- Privy:
- Arc:
- The Graph:
- Qualification claims made (if any):

## Risk review

- Security and secrets:
- Data safety and privacy:
- External effects and rollback/safe disablement:
- Architecture and performance:

## Validation evidence

| Command or check | Result |
| --- | --- |
| `<lint/type/test/build command>` | |
| `<focused/failure-injection command>` | |
| `git diff --check develop...HEAD` | |

## FreePi Gate A: pre-push

- Fresh `npx free-pi-cli` process/session:
- Reviewed base SHA:
- Reviewed target/content identity:
- Verdict (must be exact `VERDICT: PASS`):
- Blocking findings resolved:
- Evidence/summary:

## Required CI

- Exact PR head SHA:
- [ ] All required checks are green for this SHA.
- Check names/results:

## FreePi Gate B: exact draft PR

- Separate fresh `npx free-pi-cli` process/session:
- PR URL/number:
- Reviewed head SHA:
- Verdict (must be exact `VERDICT: PASS`):
- Blocking findings resolved:
- Evidence/summary:

## Human review

- [ ] Gate A is valid for current content.
- [ ] Required CI is green for current head.
- [ ] Gate B is valid for current head.
- [ ] Draft is ready for human review.
- [ ] Human explicitly authorized merge. Agents must leave this unchecked and
      must never merge.
