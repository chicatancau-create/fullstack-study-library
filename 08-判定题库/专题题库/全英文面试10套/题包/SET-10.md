# SET-10 · Legacy Monolith Migration

**Level:** Senior  **Duration:** 60 minutes  **Format:** 1 interviewer + 1 candidate  **Language:** English only

## Context

A monolith is being split into services behind a facade. Data is shared today and must be migrated without downtime.

## Agenda

| Segment | Time | What to observe |
| --- | --- | --- |
| Self-introduction | 5 min | Structure, relevance, clarity |
| Technical Q&A | 25 min | Depth, trade-offs, precision |
| Live coding | 20 min | Problem solving, code quality, testing |
| Behavioral | 10 min | Ownership, collaboration, reflection |

## 1. Self-introduction (5 min)

Ask: "Walk me through your most relevant backend or full-stack work in two minutes, then tell me why this role interests you."

Look for: a clear scope statement, the candidate's own contribution, one measurable outcome, and a reason tied to the role.

## 2. Technical Q&A (25 min)

| Area | Question | Look for |
| --- | --- | --- |
| JS/TS | How do you keep contracts between old and new code from drifting? | Generated types from OpenAPI, contract tests, CI gate. |
| React | How do you migrate a page incrementally without a big-bang rewrite? | Route-level cutover, feature flags, shared design system. |
| Node | How do you run dual writes during migration safely? | Outbox, idempotency, reconciliation, read-back verification, rollback plan. |
| SQL | How do you migrate a large table with minimal locking? | Batched backfill, online DDL, shadow table, verify counts/checksums. |
| System design | Design the cutover and rollback plan for one service. | Traffic shadowing, canary, SLO gates, data rollback, ownership. |

Follow-up rule: ask "why" once and "what breaks" once per answer. Do not accept a list of tools without trade-offs.

## 3. Live coding (20 min)

### 3.1 Algorithm (10 min)

**Task:** Sliding window maximum

Return the maximum of every window of size k.

**Example:** [1,3,-1,-3,5,3], k=3 -> [3,3,5,5]

Look for: Monotonic deque, O(n).

### 3.2 API design (10 min)

**Task:** Design a facade endpoint that can route to old or new implementation.

Deliver: endpoint(s), request/response shape, status codes, validation, failure modes, and one thing you would monitor.

Look for: Versioning, routing flag, fallback, observability, contract stability.

## 4. Behavioral (10 min)

- Tell me about the riskiest migration you have led.
- How do you decide when to stop a rollout?
- Describe a time you had to influence without authority.

## Interviewer notes

- Stop the candidate at the time box; note what was unfinished rather than letting the segment overrun.
- Record concrete quotes for the rubric, not impressions.
- Red flags: cannot name a trade-off, blames others for failures, ignores tenant or security boundaries.
