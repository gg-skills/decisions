---
name: decisions
description: when configuring unresolved decisions blocking implementation — structured tradeoff comparison, choosing between options with code/rollout implications. MCP-compatible. Not for decided work.
---

> **Snapshot age:** authored 2026-04-30. Verify release-sensitive answers with current npm scripts
> and package versions before responding with high confidence.

# GG → Decisions → Decision Packets

## Overview

Use this skill to turn unresolved user choices into a deterministic decision workflow. It finds or
creates the active decision inventory, writes a **behavior-deep** markdown decision packet to disk
(trigger, runtime flow, worked scenario, per-option before→after diffs), presents the active choice
as a compact inline summary that still includes **Behavior in plain English**, records the user's
answer, and returns a clear unblock-or-blocked status to the upstream workflow. Compact structure is
required; shallow behavior content is a defect. The interactive decision page remains available only
when the user explicitly asks for it.

For a direct command lookup, see [Quick Commands](#quick-commands) below.

## When to Use This Skill

**TRIGGER when:**
- A plan, study, or tracking artifact contains unresolved choices that block implementation.
- A workflow says implementation is blocked pending approval, tradeoff selection, or architecture
  choice.
- New research introduces alternative approaches that require user direction.
- The user asks for help comparing options before work proceeds.
- The active workflow needs one-decision-at-a-time prompting instead of batched questions.
- The user asks for a dedicated decision page, copied token exports, or interactive choice
  revision.

**SKIP when:**
- The question is purely informational with no commitment required.
- The user has already made a clear choice and only needs execution.
- A single obvious path exists with no meaningful alternatives.

## Common Misconceptions

| # | Misconception | Correction | Key concept |
|---|---------------|------------|-------------|
| 1 | The interactive HTML page is the default output. | The default is a compact inline summary **plus required behavior narrative**; the HTML page is opt-in only. | Default path vs opt-in path |
| 2 | All decisions can be presented at once in a batch. | This skill presents exactly one unresolved decision at a time, in order. | One-decision-at-a-time |
| 3 | Decision packets can be reconstructed from memory. | Every packet must follow the exact contract in `references/decision-presentation-contract.md`. | Contract-driven output |
| 4 | Mermaid diagrams are optional in decision packets. | Every packet must include at least one Mermaid diagram following the safety rules. | Visual requirement |
| 5 | The user's natural-language answer does not need persistence. | Every answer must be persisted back to the authoritative inventory immediately. | Durability |
| 6 | Any token format is acceptable for decision choices. | Tokens must follow `CHOOSE_DECISION_<ID>_<OPTION>` exactly. | Token consistency |
| 7 | Decision options can be vague if context is clear. | Each option needs behavioral diff, observables, edge cases, code/diff, pros, cons, and impact. | Option concreteness |
| 8 | Exploratory paths are optional for commitment decisions. | Every packet must include `STUDY_OPTIONS`, `RESEARCH_OPTIONS`, and `DEEPENING_OPTIONS` first. | Exploratory-first |
| 9 | Compact inline summary means shallow content. | Compact refers to structure (tables + short sections), not missing behavior depth. | Depth mandate |
| 10 | Listing file paths equals explaining behavior. | Behavior needs trigger, step-by-step flow, state, and operator-visible outcomes. | Behavioral explanation |
| 11 | A 3-node Mermaid diagram is enough "how it works". | Diagrams support prose; each option needs Before→After behavioral diff in words. | Prose + diagram |

## Quick Commands

```bash
# Validate Mermaid diagrams in a decision packet
npm run check:mermaid -- --files <decision-packet.md>

# Generate the interactive decision page from a JSON definition
npx tsx .agents/skills/decisions/scripts/generate-decision-page.ts --input <definition.json> --output <page.html>

# Run the full decision page test suite
npx tsx .agents/skills/decisions/tests/decision-page-generator.unit.test.ts

# Session helper: prepare page and definition together
npx tsx .agents/skills/decisions/scripts/decision-page-session.ts prepare --definition-file <definition.json> --output-dir <dir>

# Check decision packet completeness (18-item checklist, includes behavior depth)
npx tsx .agents/skills/decisions/scripts/check-decision-completeness.ts --latest
npx tsx .agents/skills/decisions/scripts/check-decision-completeness.ts --packet <path.md>
npx tsx .agents/skills/decisions/scripts/check-decision-completeness.ts --latest --json
```

For full command surface, see `references/decision-page-json-contract.md`.

## Decision Quality Checklist

Use this checklist before presenting any decision packet. Each item is a gate—the decision is not ready until all required items are satisfied.

| # | Checklist Item | Why It Matters | Gate |
|---|---------------|---------------|------|
| 1 | **Decision clarity** — The decision states a single clear choice with context | Prevents confused choices | Pre-draft |
| 2 | **Status declared** — Current status (open/answered/deferred/blocked) is explicit | Enables tracking | Pre-draft |
| 3 | **Upstream artifact linked** — Source plan or study path is referenced | Enables traceability | Pre-draft |
| 4 | **Options concrete** — Each option has behavioral diff, observables, edge cases, code/diff, pros, cons, impact | Enables informed choice | Draft |
| 5 | **Exploratory paths included** — STUDY/RESEARCH/DEEPENING options precede commitment | Prevents premature commitment | Draft |
| 6 | **Mermaid diagram present** — At least one valid diagram following safety rules | Enables visual understanding | Draft |
| 7 | **Diagram validated** — `npm run check:mermaid` passes without errors | Prevents broken renders | Draft |
| 8 | **Token format correct** — All tokens follow `CHOOSE_DECISION_<ID>_<OPTION>` | Enables programmatic selection | Draft |
| 9 | **Blocking status declared** — Whether decision blocks implementation is explicit | Enables planning gate | Draft |
| 10 | **Impact surface documented** — Affected files, systems, tests are listed | Enables scope awareness | Draft |
| 11 | **Recommended option stated** — Recommendation with evidence is provided | Provides guidance | Closeout |
| 12 | **Inline summary usable** — Behavior narrative + table with concrete identifiers | Enables understanding and scanning | Closeout |
| 13 | **Answer persistence path clear** — How to persist the answer is documented | Enables durability | Closeout |
| 14 | **Next decision queued** — Next unresolved decision is identified | Enables flow | Closeout |
| 15 | **Behavior being decided** — Trigger, step-by-step flow, state, operator observation, fork | Enables full understanding | Draft |
| 16 | **Worked scenario** — Concrete setup traced through current behavior and each option | Makes consequences tangible | Draft |
| 17 | **Per-option behavioral diff** — Before→After prose for every choosable option | Prevents slogan-only options | Draft |
| 18 | **Observable outcomes** — What humans notice after each option ships | Grounds choice in reality | Draft |

### Quality Tiers

| Tier | Criteria | Use When |
|------|----------|----------|
| **Minimal** | Items 1, 2, 4, 8, 15 | Tiny non-blocking choice with real behavior explanation |
| **Standard** | Items 1-11, 15-18 | Multi-option decision with evidence and depth |
| **Full** | All 18 items | Complex or blocking decision |

**Default bar:** Standard/Full. Minimal is only for low-stakes non-blocking choices — never for architecture, policy, or recycle/kill paths.

### Pre-Presentation Verification

Before presenting a decision, verify:

```
□ Decision is clear and singular
□ Status is declared (open/answered/deferred/blocked)
□ Upstream artifact linked
□ Behavior Being Decided explains trigger, flow, state, observation, fork
□ Worked Scenario uses concrete identifiers and per-option outcomes
□ At least 2 options with behavioral diff, observables, edge cases, pros/cons/impact
□ Exploratory paths included (STUDY/RESEARCH/DEEPENING)
□ Mermaid diagram present and validated
□ Token format correct (CHOOSE_DECISION_<ID>_<OPTION>)
□ Blocking status declared
□ Impact surface documented
□ Recommended option stated with evidence
□ Inline summary includes Behavior in plain English (not tables only)
□ Answer persistence path is clear
□ Next decision is queued
```

## Decision Consistency Validator

Before presenting a decision, run these consistency checks. A decision that fails any check must be fixed before presentation.

### Consistency Check Matrix

| Check | What to Verify | How to Fix |
|-------|---------------|------------|
| **Options vs Pros/Cons** | Every option has corresponding pros and cons | Add missing pros/cons |
| **Pros/Cons vs Impact** | Pros/cons align with stated impact | Verify impact is consistent |
| **Behavioral Diff vs Scenario** | Each option's diff matches its worked-scenario outcome | Align prose |
| **Behavior vs System View** | Mermaid/flow matches Behavior Being Decided steps | Fix diagram or prose |
| **Recommendation vs Evidence** | Recommendation has supporting evidence | Add evidence or qualify recommendation |
| **Mermaid vs Options** | Diagram reflects all options in the decision | Update diagram |
| **Token vs Options** | Each token matches exactly one option name | Fix token format |
| **Blocking vs Upstream** | Blocking status matches plan/study intent | Clarify with upstream |
| **Impact vs Files** | Impact list matches affected systems | Add missing files |
| **Exploratory vs Commitment** | Exploratory paths precede commitment paths | Reorder options |
| **Status vs History** | Status matches prior decisions in inventory | Update status or history |
| **Next vs Queue** | Next decision is actually next in priority | Reorder queue |

### Red Flags (Never Present)

A decision with any of these must be fixed before presenting:

- [ ] Option without any pros or cons
- [ ] Option without Before→After behavioral diff prose
- [ ] No `Behavior Being Decided` section (or only a title restatement)
- [ ] No worked scenario with concrete identifiers
- [ ] Inline summary with comparison tables but no Behavior in plain English
- [ ] Recommendation without supporting evidence
- [ ] Token format does not match `CHOOSE_DECISION_<ID>_<OPTION>`
- [ ] Mermaid diagram fails validation
- [ ] Contradictory statements in different options
- [ ] Blocking decision without clear resolution path
- [ ] Pros/cons that are only abstract adjectives with no mechanism

## Non-Negotiable Policy

1. Always identify the authoritative decision inventory in the active plan or study before prompting
   the user.
2. Never reconstruct decision packet structure, CLI flags, or presentation format from memory --
   always read the relevant reference contract first.
3. Default to the markdown decision packet artifact for every decision. The packet must follow
   `references/decision-presentation-contract.md`, be written to a file, and remain the detailed
   source of truth. Present a compact inline summary that **includes Behavior in plain English**
   unless the user explicitly asks for the full packet inline or the interactive page.
4. Only generate the interactive HTML page when the user explicitly requests it. When they do,
   present it as a clickable `file://` link with a plain-English summary of the decisions it
   resolves.
5. `CHOOSEABLE_OPTIONS` must always list the recommended option first. When presenting the
   inline summary, also invoke the harness Ask User picker if that tool is available, mapped per
   `chooseable-options/references/ask-user-harness.md`. Every option must include
   multi-sentence description, Before→After behavioral diff, observable outcomes, edge cases,
   pros, cons, concrete code or pseudo-diff, a Mermaid diagram with caption, worked-scenario
   outcome, and impact notes. Present exploratory paths (`STUDY_OPTIONS`, `RESEARCH_OPTIONS`,
   `DEEPENING_OPTIONS`) before commitment paths.
5b. Never present a decision the user cannot fully understand from the packet's Behavior Being
   Decided + Worked Scenario sections. Compact structure is required; shallow behavior content is
   a defect. When depth and brevity conflict, keep depth.
6. Every markdown decision packet must include a Mermaid diagram following the safety rules in
   `references/decision-presentation-contract.md`. Validate diagrams with
   `npm run check:mermaid -- --files <packet.md>` after writing.
7. Load only the subset of `references/` the task requires. Do not read every file by default.
8. Persist the chosen option or defer state back to the authoritative inventory immediately. If a
   blocking decision is deferred, continue immediately to the next unresolved decision without
   waiting. For any answer about validator versions, CLI flags, npm scripts, or bundled tool
   behavior: treat the guidance as likely stale and verify against current `package.json` or the
   research skill before stating specifics.

## Quick Decision Guide

| Scenario | Recommended path | Why |
|----------|-----------------|-----|
| User needs to choose between implementation options | Markdown packet + inline table summary | Default; durable; concrete |
| User explicitly asks for interactive page | JSON definition -> `generate-decision-page.ts` | Opt-in only; richer UX |
| User pastes back a token block | `decision-page-session.ts sync-plan` | Keeps plan and structured source aligned |
| User wants simpler visual explanation before choosing | Hand off to `explain/SKILL.md` | Lower cognitive load |
| User needs more evidence before choosing | Hand off to `study/SKILL.md` or `research-online/SKILL.md` | Evidence-first |

**Rule of thumb:** Default to the markdown packet and inline table summary; escalate to the
interactive page only on explicit request.

## Decision Inventory Normalization

Before presenting a decision, normalize the inventory in this order:

1. Active `.plans/YYYY-MM-DD-task-name-slug/plan-<slug>-YYYY-MM-DD.md`:
   - use the existing decision/open-questions section when present,
   - otherwise add a `Decision Register` section.
2. Active study under `.studies/`:
   - use the study's decision log / open questions handoff,
   - keep the study as evidence and route the user-facing decision packet through this skill.
3. Session-only fallback:
   - if no durable artifact exists yet, create a session decision register and explicitly note which
     downstream artifact must be updated once the user answers.

Normalize each unresolved item with:
- a verbose `DECISION_ID`,
- current status (`open`, `answered`, `deferred`, `blocked`),
- the exact upstream artifact path/URL/section reference,
- the recommended option if one already exists,
- impacted files, systems, tests, and follow-up skills,
- whether the decision blocks implementation immediately.

After normalization, materialize the queue as a markdown decision packet per
`references/decision-presentation-contract.md` (including Depth Mandate sections). Write the packet
under `.tmp/decisions/YYYY-MM-DD-{subject}/` unless an active study or plan already defines a better
artifact location. Run
`npx tsx .agents/skills/decisions/scripts/check-decision-completeness.ts --packet <path>` before
presenting; do not present when required depth items fail.

## One-Decision Interaction Loop

1. Build an ordered queue of unresolved decisions, with blocking items first.
2. Write a markdown decision packet per `references/decision-presentation-contract.md` for the
   active decision, validate its Mermaid diagrams, and present a compact inline table summary
   plus the native Ask User picker when that tool is available.
3. Only if the user explicitly asks for the interactive page: build JSON per
   `references/decision-page-json-contract.md` and generate it with
   `npx tsx .agents/skills/decisions/scripts/decision-page-session.ts prepare ...` or
   `npx tsx .agents/skills/decisions/scripts/generate-decision-page.ts ...`. Present as a clickable `file://` link with a plain-English
   summary.
4. Wait for the user reply.
5. Support reply modes: native picker selection, direct token, pasted token block, natural language, clarifying questions,
   request for study/research/explanation.
6. If the user requests simpler explanation: keep decision active, route to
   `explain/SKILL.md`, then return.
7. If the user requests more study or research: keep decision active, route to
   `study/SKILL.md` or `research-online/SKILL.md`, then return.
8. After a choice is made, persist the outcome back to the authoritative inventory.
9. Continue immediately to the next unresolved decision.
10. End with a short resolution summary and one of:
    - `Implementation is unblocked.`
    - `Implementation remains blocked by deferred decisions.`

## Reference Loading by Task Type

| Task type | Load these files | Skip |
|-----------|-----------------|------|
| Formatting a markdown decision packet | `references/decision-presentation-contract.md` (Depth Mandate + Behavior/Worked Scenario + option template) | `references/decision-page-json-contract.md` |
| Building an interactive decision page | `references/decision-page-json-contract.md` | full presentation contract except when page embeds packet text |
| Validating Mermaid diagrams in a packet | `references/decision-presentation-contract.md` (Mermaid Safety Rules) | `references/decision-page-json-contract.md` |
| Syncing token blocks back to a plan | `references/decision-page-json-contract.md` (Clipboard Payload) | `references/decision-presentation-contract.md` |
| Checking depth/completeness before present | Run `npx tsx .agents/skills/decisions/scripts/check-decision-completeness.ts --packet <path>` | -- |
| Diagnostic / inspection-first | Run `npm run check:mermaid -- --files <packet.md>` and `npx tsx .agents/skills/decisions/tests/decision-page-generator.unit.test.ts` before loading files | -- |

For diagnostic requests, run the inspection commands first before loading any reference files. Load
only the subset the task needs.

## Cross-Skill Coordination

- `plan/SKILL.md` -- use when execution decisions remain unresolved before
  implementation continues.
- `study/SKILL.md` -- hand off study-derived open questions and recommendation
  tradeoffs when the user must choose a direction.
- `chooseable-options/SKILL.md` -- owns printed-token plus native Ask User presentation.
- `explain/SKILL.md` -- use when the options are valid but the current decision
  surface is too dense for confident user comprehension.
- `research-online/SKILL.md` -- use when current external docs, standards, or product
  behavior must be checked before the user can choose confidently.
- the `documentation-sync` workflow -- use after a decision changes contracts, behavior,
  or guidance that must be documented.
- `specs/SKILL.md` -- use when decision resolution reveals new issues or
  improvement opportunities that need investigation-ready specs.

## Decision Generation Template

Use this template when presenting a decision to the user. Fill in each section with specific content.

### Decision Packet Structure

```markdown
# Decision: [Clear decision statement]
**Decision ID:** DECISION_<ID>
**Status:** [open | answered | deferred | blocked]
**Quality Tier:** [Minimal | Standard | Full]
**Upstream:** [Plan/study path]
**Blocks Implementation:** [Yes | No]

## Why This Needs A Choice Now
[Blocked work, wrong-choice risk, affected areas]

## Context You Need To Decide
[Current state, constraints, assumptions, tradeoffs, unknowns, impacted surface]

## Behavior Being Decided
- **Trigger:** ...
- **Entry points:** `module.fn`, route, job, ...
- **Step-by-step current flow:** 1) ... 2) ... 3) ...
- **State read / written:** ...
- **Operator observation:** ...
- **Invariant vs fork:** ...

## Worked Scenario
- **Name / Setup / Trigger:** concrete identifiers
- **Current outcome:** ...
- **Per-option outcomes:** ...

## System View
```mermaid
flowchart LR
    A["Trigger"] --> B["Current flow"]
    B --> C{"Decision fork"}
```

## Representative Code
```ts
// real or pseudo-diff grounded in entry points
```

## STUDY_OPTIONS / RESEARCH_OPTIONS / DEEPENING_OPTIONS
[At least one path each]

## CHOOSEABLE_OPTIONS
### `(recommended)` `CHOOSE_DECISION_<ID>_<OPTION_A>` `(recommended)`
- Description (2–4 sentences)
- Behavioral Diff Before→After
- Observable Outcomes
- Edge Cases
- Pros / Cons
- Representative Code
- How It Works (caption + mermaid)
- Worked Scenario Outcome
- Impact

### `CHOOSE_DECISION_<ID>_<OPTION_B>`
[Same structure]

## How The Answer Will Be Recorded
[Persistence path + unblock state]

## Summary
[Decision, recommendation, exploration, choices, blocking, next]
```

### Token Format Rules

| Token | Meaning |
|-------|--------|
| `CHOOSE_DECISION_<ID>_OPTION_A` | Select Option A |
| `CHOOSE_DECISION_<ID>_OPTION_B` | Select Option B |
| `STUDY_OPTIONS` | Study more before deciding |
| `RESEARCH_OPTIONS` | Research before deciding |
| `DEEPENING_OPTIONS` | Gather more evidence |

### Option Completeness Checklist

For each option, verify:
```
□ Description is 2–4 sentences (not a slogan)
□ Behavioral Diff has explicit Before and After
□ Observable Outcomes name what humans notice
□ At least 2 edge cases (handles and/or ignores)
□ At least 2 pros and 2 cons grounded in the diff
□ Code/diff is concrete (not vague)
□ Worked Scenario Outcome is scenario-specific
□ Impact lists specific files/tests/systems
□ Mermaid diagram + caption reflects the option
□ Token format matches (CHOOSE_DECISION_<ID>_<OPTION>)
```

## Common Pitfalls

1. **Generating the HTML page by default.** This happens when the agent assumes richer UX is always
   better. The correct approach is to default to the markdown packet and inline summary (with
   Behavior in plain English) unless the user explicitly asks for the page. See
   `references/decision-presentation-contract.md`.
2. **Skipping Mermaid validation.** This happens when the agent trusts diagrams written from memory.
   A single syntax error breaks the entire render. Always run
   `npm run check:mermaid -- --files <packet.md>` after writing. See
   `references/decision-presentation-contract.md` Mermaid Safety Rules.
3. **Presenting multiple decisions at once.** This happens when the agent tries to be efficient by
   batching. This skill resolves exactly one decision at a time to keep each choice focused.
   Batching defeats the purpose.
4. **Forgetting to persist the answer.** This happens when the agent treats chat history as durable.
   The correct approach is to write the choice back to the plan or study immediately using the
   inventory normalization path.
5. **Using ambiguous selector tokens.** This happens when the agent invents short tokens for
   convenience. Tokens must follow `CHOOSE_DECISION_<DECISION_ID>_<OPTION_NAME>` exactly. See
   `references/decision-presentation-contract.md`.
6. **Omitting exploratory paths.** This happens when the agent rushes to implementation options.
   Every packet must include `STUDY_OPTIONS`, `RESEARCH_OPTIONS`, and `DEEPENING_OPTIONS` before
   `CHOOSEABLE_OPTIONS`. See `references/decision-presentation-contract.md`.
7. **Shallow behavior content.** This happens when the agent optimizes for short tables and skips
   teaching the runtime path. Always write `Behavior Being Decided` + `Worked Scenario` in the
   packet and mirror the behavior narrative inline. File lists and 3-node diagrams are not enough.
8. **Slogan options.** This happens when options are titled without Before→After diffs. Every
   choosable option needs behavioral diff, observables, and scenario outcome.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Mermaid validation fails with "Syntax error in text" | Unquoted node label containing parentheses, colons, or backticks | Quote every label with `["..."]` and remove markdown syntax inside labels. See `references/decision-presentation-contract.md`. |
| Generated HTML page shows no decisions | JSON definition missing `decisions` array or all decisions filtered by `dependsOn` | Validate the definition with `npx tsx .agents/skills/decisions/tests/decision-page-generator.unit.test.ts` and check `dependsOn` chains. |
| Token block sync fails with "unknown decision token" | Token in the pasted block does not match any option in the definition | Verify the token spelling matches `CHOOSE_DECISION_<DECISION_ID>_<OPTION_NAME>` exactly. |
| Inline summary is too long for terminal scanning | Comparison table has too many low-value rows | Keep Behavior in plain English + behavior/scenario comparison rows; move secondary rows to the packet. Never delete the behavior narrative first. |
| User cannot choose from the inline summary alone | Missing behavior narrative or cells lack identifiers/outcomes | Add Behavior in plain English; fill Runtime flow change / Worked scenario outcome rows with concrete before→after text. |
| User says the decision is too shallow | Packet skipped Behavior Being Decided / Worked Scenario or options lack diffs | Rewrite those sections per Depth Mandate; re-run completeness checker before re-presenting. |
| `npm error Missing script: check:mermaid` from the repo root | Root `package.json` is out of sync with the decisions skill | Confirm `package.json` lists `check:mermaid`; if missing, run `npm install` then retry. As a fallback run the script directly: `npx tsx .agents/skills/decisions/scripts/check-mermaid.ts --files <packet>`. |
| `check:mermaid` exits 1 with `unquoted-square-label` | A node label is `[label]` instead of `["label"]` | Quote every label: `A["Start"] --> B["End"]`. See `references/decision-presentation-contract.md` Mermaid Safety Rules. |
| `check:mermaid` exits 1 with `extraction-failed` | Markdown file has no ```mermaid fences but `--input-type markdown` was forced | Drop the `--input-type markdown` flag (let `auto` decide) or add a mermaid fence. |
| `check-decision-completeness` reports `Diagram validated` as FAILED | A ```mermaid fence is missing its `<!-- mermaid-checked: ... -->` marker | Re-run `npm run check:mermaid -- --files <packet> --emit-marker` and ensure the marker timestamp is within `MERMAID_STALENESS_MS` (default 24h). |

## Temporary Files

Place temporary files under `.tmp/decisions/YYYY-MM-DD-{subject}/`. The root
`.tmp/` directory is already gitignored. Do not create top-level dotfile temp directories.

## Local Corpus Layout

The `references/` directory contains 2 flat files (no subfolders):

- `references/decision-presentation-contract.md` -- Depth Mandate, detailed packet order (including
  Behavior Being Decided and Worked Scenario), option template with behavioral diffs, inline
  summary rules, selector-token rules, exploratory paths, and Mermaid Safety Rules.
- `references/decision-page-json-contract.md` -- JSON definition schema for the interactive decision
  page, dependency and invalidation rules, and summary-plus-tokens clipboard contract.

## Guidance Alignment

- Apply repository guidance consistently with `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md`.
- If this skill file is updated, run `npm run skills:sync` so IDEs pick up the new version
  immediately.
- If guidance semantics changed, run the `agents-sync` workflow before workflow
  closure.
- Snapshot verified: 2026-04-30. Verify Mermaid validator versions, CLI behavior, and npm script
  names against current `package.json` before relying on bundled guidance.
