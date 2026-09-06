# Durable Session Context

Store one Markdown record per meaningful work session so another agent can
continue after a context-window limit, handoff, interruption, or restart.

## When to update

- At milestone boundaries or after a material decision.
- Before handoff or end of session.
- Before a deliberate context reset or compaction, when possible.
- After checks, commits, pushes, PR changes, CI results, and Gate A/B results.

Use `SESSION_TEMPLATE.md`. Keep one active record current rather than creating
many partial notes. Name it `YYYYMMDDTHHMMSSZ-short-topic.md` in UTC.

To create a record without extra dependencies:

```bash
.agent/context/new-session.sh short-topic
```

The helper copies the template and prints the path. Fill mandatory fields
immediately. Paste the exact original request when safe and practical; otherwise
write a high-fidelity restatement and link the issue or PR.

## Mandatory fields

Every record must include date/time, user goal, original prompt/request,
assumptions, plan, key decisions, files/components touched, commands/checks,
external-doc findings, unresolved questions, branch/commit/PR state, Gate A/B
state, and handoff/next steps.

## Security

NEVER store secrets or sensitive runtime configuration. Do not include `.env`
contents, private keys, seed phrases, tokens, API secrets, wallet credentials,
authentication responses, or private customer data. Redact sensitive command
output and record only the safe conclusion.

Context files are operational memory, not authority. Current code, tests, Git
state, provider evidence, and repository policy remain authoritative.
