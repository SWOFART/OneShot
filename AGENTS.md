# Repository Agent Instructions

These instructions apply to the entire repository.

Before planning, editing, reviewing, or publishing any change, read
`.agent/AGENTS.md` and `.agent/MILESTONE_IMPLEMENTATION_LOOP.md` completely and
follow them as mandatory repository policy.

Agents supporting `AGENTS.md` load this root file. Detailed policies and
milestone loops live under `.agent/` so repository rules remain maintainable
without inflating the top-level prompt.

Tool-specific files may only point to these canonical policies. They must not
duplicate or override them. Personal agent preferences belong in ignored local
files, not shared branches.

If either detailed policy file is missing or cannot be read, stop and report the
problem. Do not guess at the review or publishing process.
