# SET-09 · Auth and Permissions Platform

**Level:** Senior  **Duration:** 60 minutes  **Format:** 1 interviewer + 1 candidate  **Language:** English only

## Context

A platform provides SSO, role-based access control and audit logs to multiple product teams.

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
| JS/TS | How do you represent roles and permissions without stringly-typed bugs? | Const enums or union types, permission checks centralized, tests per role. |
| React | How do you hide or disable UI based on permissions without duplicating rules? | Server-provided capability list, single guard component, never trust client alone. |
| Node | Where do you validate a JWT, and what do you do on key rotation? | Verify signature/issuer/audience/expiry, JWKS cache, refresh path. |
| SQL | How do you model hierarchical roles or teams? | Closure table or recursive CTE, cycle prevention, index strategy. |
| System design | Design an authorization service used by many products. | Policy model, caching and invalidation, audit, latency budget, failure mode. |

Follow-up rule: ask "why" once and "what breaks" once per answer. Do not accept a list of tools without trade-offs.

## 3. Live coding (20 min)

### 3.1 Algorithm (10 min)

**Task:** Topological sort

Given task dependencies, return a valid execution order or detect a cycle.

**Example:** A->B, A->C, B->C -> [A,B,C]

Look for: Kahn's algorithm or DFS with colors; cycle detection.

### 3.2 API design (10 min)

**Task:** Design `POST /authorize` for policy evaluation.

Deliver: endpoint(s), request/response shape, status codes, validation, failure modes, and one thing you would monitor.

Look for: Input shape, decision caching, deny reasons, audit, p99 target.

## 4. Behavioral (10 min)

- Tell me about a time you influenced a cross-team standard.
- How do you handle a stakeholder who wants to bypass security controls?
- Describe how you have grown other engineers.

## Interviewer notes

- Stop the candidate at the time box; note what was unfinished rather than letting the segment overrun.
- Record concrete quotes for the rubric, not impressions.
- Red flags: cannot name a trade-off, blames others for failures, ignores tenant or security boundaries.
