# Planning

Issues are the backlog. [ROADMAP.md](../../ROADMAP.md) is the milestone list.
Pull requests implement one issue or one tight outcome. [CONTRIBUTING.md](../../CONTRIBUTING.md)
is the contributor path.

## Triage

Every new issue starts as `status:needs-triage`.

1. Confirm the template is filled and that secrets are absent.
2. Set one `type:*` label. The form usually does this.
3. Set one `area:*` label.
4. Set one `priority:*` label. Use `priority:p0` only when a payment can be
   duplicated, lost, or mis-recorded, or when a hosted surface is down.
5. Move the issue to `status:ready`, or to `status:blocked` with the blocker
   written in a comment.
6. Attach a GitHub milestone when the issue belongs to one. Milestone names
   should match the roadmap.

Security reports stay off the public tracker. See [SECURITY.md](../../SECURITY.md).

## Plans

Use the Epic or plan template when the work is larger than one pull request.
The plan issue records outcome, acceptance criteria, scope, non-goals, and how
the settlement invariant is preserved. Child issues link the plan. Close the
plan when the acceptance criteria are met, not when the first pull request
merges.

A plan does not authorize mainnet, a new chain, or a live payment. Those need
the chain-integration template or an explicit maintainer decision.

## Pull requests

Branch from `develop`. Link the issue. Fill the pull request template. Required
CI must be green on that head before a human merges.

Set `status:in-progress` when work starts and `status:needs-review` when the
pull request is ready. Close the issue from the pull request when the outcome
is merged.

## GitHub Project

A project board is optional. Create it in the GitHub UI if you want one. This
repository does not create the project, milestones, or labels on its own.

Suggested project name: `OneShot`.

Suggested fields, matching the labels:

| Field     | Values                                                                 |
| --------- | ---------------------------------------------------------------------- |
| Status    | Needs triage, Ready, In progress, Blocked, In review, Done            |
| Priority  | P0, P1, P2, P3                                                         |
| Area      | Settlement, Reconciliation, API, Worker, Web, MCP, Chain, Storage, Docs, CI |
| Milestone | The GitHub milestone, when one is set                                 |

Use issues as the project items. Pull requests stay linked from those issues.
The `Sync labels` workflow only creates and updates the label catalog in
[`.github/labels.yml`](../../.github/labels.yml).
