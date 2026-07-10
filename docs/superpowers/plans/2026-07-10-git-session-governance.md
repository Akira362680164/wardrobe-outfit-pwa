# Git Session Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a concise mandatory Git isolation rule to the local `AGENTS.md` and a tracked operating guide for creating, integrating, pushing, and cleaning Session worktrees.

**Architecture:** Keep enforceable invariants near the top of `AGENTS.md`, while moving commands and exception handling into `docs/development/git-session-workflow.md`. Preserve the current repository policy that keeps the machine-local `AGENTS.md` ignored, and record the governance change in `VERSION_HISTORY.md`.

**Tech Stack:** Git worktrees, Markdown, macOS `trash`

## Global Constraints

- App baseline is local `main`; mini-program baseline is local `wechat/miniprogram`.
- Every editing Session uses an independent branch, worktree, and directory.
- GitHub backs up validated formal baselines and is not the default development baseline.
- Worktree deletion must use the macOS Trash workflow defined by `AGENTS.md`.
- Do not change application runtime code or package version.

---

### Task 1: Add the tracked workflow guide

**Files:**
- Create: `docs/development/git-session-workflow.md`

**Interfaces:**
- Consumes: the approved concise isolation rules and existing repository deletion policy.
- Produces: the detailed guide linked by `AGENTS.md`.

- [x] **Step 1:** Document preflight, Session creation, fixed-worktree development, integration, cross-baseline changes, push checks, and safe cleanup.
- [x] **Step 2:** Run `git diff --check` and review all command examples for local-baseline semantics.

### Task 2: Activate and record the governance rule

**Files:**
- Modify locally: `AGENTS.md`
- Modify: `VERSION_HISTORY.md`

**Interfaces:**
- Consumes: `docs/development/git-session-workflow.md` from Task 1.
- Produces: a concise mandatory rule near the start of `AGENTS.md` and a human-readable version-history entry.

- [x] **Step 1:** Insert the approved concise rule after the reading-order section in the machine-local `AGENTS.md`.
- [x] **Step 2:** Add a `v2.1.12-test` documentation-governance entry to `VERSION_HISTORY.md`.
- [x] **Step 3:** Validate links, headings, whitespace, branch state, and staged scope.
- [x] **Step 4:** Prepare the validated tracked files for commit and formal integration.
