# OneShot Independent Milestones

This directory turns `plan.md` into small, independently closable work packets for exactly three coders. The folder name is intentionally spelled `milestones`.

## Start here

1. Read root `AGENTS.md` and the documents it routes.
2. Read [`CONTRACTS.md`](CONTRACTS.md); it is the frozen v1 seam for every lane.
3. Open only your coder directory and current packet.
4. Create one branch/PR for that packet.
5. Close the packet using its local acceptance evidence, publish its contract pack, and start the next same-owner packet immediately.

## Lanes

- [`coder-a/`](coder-a/README.md): domain, storage, API, worker, composition, intent/status UI, operations.
- [`coder-b/`](coder-b/README.md): Privy, Arc, request/receipt safety, provider ambiguity, settlement UI, sponsor evidence.
- [`coder-c/`](coder-c/README.md): The Graph candidate discovery through Subgraph MCP, LLM Recovery Agent, deterministic reconciliation, failure injection, recovery UI, qualification.

Each lane has six ordered packets. A packet depends only on the frozen contract pack and the preceding packet in the same directory. A real package from another coder is never required for packet closure; use the checked simulator until project Gate P4.

## Packet status

Use these states in the PR or project tracker:

- `READY`: frozen inputs exist; work may start.
- `ACTIVE`: owner is implementing.
- `REVIEW`: local acceptance passed and exact candidate is under review.
- `DONE`: focused artifact, checks, contract pack, and review evidence are complete.
- `BLOCKED_EXTERNAL`: a live-evidence step needs a human credential/service; offline packet acceptance must still be completed.

`BLOCKED_EXTERNAL` does not prevent starting the next packet if its offline inputs exist.

## Independence rules

- Never depend on another coder’s active branch.
- Never import another coder’s private implementation path.
- Consume only frozen schemas, fixtures, simulators, or reviewed package exports.
- Preserve backward compatibility within a delivery phase.
- Convert breaking proposals into additive versioned contracts.
- A project integration failure creates a focused ticket for the owning lane; it does not reopen unrelated completed packets.
- Status meetings and review availability do not gate coding. Record assumptions and continue fail-closed.

## Small-task sizing

Every numbered task inside a packet should produce one coherent, independently reviewable commit. If it cannot be reviewed independently, split it by observable behavior, not by internal layer.

Good split: schema + migration, replay behavior, conflict behavior, concurrency proof.
Bad split: “all database code,” “all tests,” or “finish integration.”

## Contract-pack checklist

Each packet that publishes a seam includes:

- semantic version or fixture-set version;
- exported types/schema;
- success and terminal/error fixtures;
- deterministic simulator or fake;
- package-local verification command;
- compatibility and redaction notes.

## Branch naming

Use `milestone/<packet-id>-<short-name>`, for example:

```text
milestone/a02-durable-intents
milestone/b03-live-settlement-harness
milestone/c04-recovery-matrix
```

Each PR targets the current integration branch chosen by the human owner and follows `.agent/IMPLEMENTATION_LOOP.md`.

## Project gates versus packet closure

P0–P6 in `plan.md` are product-level evidence gates. They do not redefine packet `DONE`.

- A04/B04/C04 close against simulators and contract packs.
- P4 later replaces simulators with exact reviewed package versions and runs live/integrated proof.
- A05/B05/C05 are held in `READY` until P4 because frontend is intentionally last.
- A coder who reaches this hold early improves backend tests, docs, fixtures, or operational evidence; they do not start production UI early.

## Change protocol

For a required contract change:

1. Open a short ADR explaining safety and compatibility impact.
2. Add the new field/result/version without deleting the old one.
3. Add fixtures and simulator behavior for both forms.
4. Let each owner migrate independently.
5. Remove the old form only in a later, separately reviewed packet.

Never reinterpret `UNKNOWN`, monetary precision, settlement ownership, or Graph/MCP/LLM authority through a compatibility shortcut.
