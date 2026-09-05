# Antigravity CLI Review Configuration

This directory contains configuration, prompts, and documentation for personal code review workflows using Antigravity CLI (gy).

## Purpose

- Allows developers to run independent Review Gate A and Review Gate B evaluations using Antigravity CLI without conflicting with other team members' local review tooling.
- Keeps personal Antigravity review logs and configurations decoupled from core repository policies.

## Review Gates

- **Gate A (Pre-PR Workspace Review)**:
  Run in Antigravity CLI using .agent/review-prompts/implementation-review.md.
  Evaluates workspace diff against develop before draft PR creation.
- **Gate B (Post-PR Draft Review)**:
  Run in Antigravity CLI using .agent/review-prompts/draft-pr-review.md.
  Evaluates draft PR head commit, status checks, and diff against develop.
