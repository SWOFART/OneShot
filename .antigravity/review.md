# Antigravity CLI Review Guide

## Workflow

1. Open Antigravity CLI (gy) in the repository workspace.
2. For **Gate A**:
   - Provide the prompt from .agent/review-prompts/implementation-review.md.
   - Specify target base branch: develop.
   - Verify verdict (VERDICT: PASS).
3. For **Gate B**:
   - Provide the prompt from .agent/review-prompts/draft-pr-review.md.
   - Supply PR number, head SHA, and CI check status.
   - Verify verdict (VERDICT: PASS).
4. Attach review summary and verdict to the pull request.
