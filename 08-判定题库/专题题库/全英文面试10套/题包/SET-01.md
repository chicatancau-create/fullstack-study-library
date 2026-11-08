# SET-01 · Multi-tenant Task Platform

**Level:** Mid  **Duration:** 60 minutes  **Format:** 1 interviewer + 1 candidate  **Language:** English only

## Context

A B2B task platform serves many workspaces. Tasks, comments and memberships are tenant-scoped; one owner may hold only one in-progress task per workspace.

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
| JS/TS | Explain the difference between `unknown` and `any` in TypeScript, and when you would choose each. | Prefers `unknown` at boundaries; requires narrowing before use; `any` disables checking. |
| React | How do you keep a task list consistent when two requests resolve out of order? | AbortController, request ids, ignore stale responses, server version field. |
| Node | Where would you enforce the one-active-task rule: application code, database, or both? Why? | Both: app gives a clear 409; DB partial unique index is the real invariant. |
| SQL | Write the idea of a partial unique index for `(workspace_id, owner_id) WHERE status = 'in_progress'`. | Correct predicate, understands index only covers rows matching predicate. |
| System design | Sketch the request flow for creating a task with tenant isolation and audit logging. | Authn, tenant claim, authorization, transaction, audit row in same transaction. |

Follow-up rule: ask "why" once and "what breaks" once per answer. Do not accept a list of tools without trade-offs.

## 3. Live coding (20 min)

### 3.1 Algorithm (10 min)

**Task:** Maximum sum of any contiguous subarray of length k

Given an integer array and k, return the maximum sum of any contiguous subarray of length exactly k. Return null if the array is shorter than k.

**Example:** [2,1,5,1,3,2], k=3 -> 9

Look for: Sliding window, O(n) time, O(1) space.

### 3.2 API design (10 min)

**Task:** Design `POST /workspaces/{id}/tasks` for the platform.

Deliver: endpoint(s), request/response shape, status codes, validation, failure modes, and one thing you would monitor.

Look for: Tenant scoping, owner uniqueness conflict (409), validation, idempotency expectations, error shape.

## 4. Behavioral (10 min)

- Tell me about a time you disagreed with a teammate about a technical decision. How did it end?
- Describe a production incident you owned. What did you change afterwards?
- How do you decide when a design is good enough to ship?

## Interviewer notes

- Stop the candidate at the time box; note what was unfinished rather than letting the segment overrun.
- Record concrete quotes for the rubric, not impressions.
- Red flags: cannot name a trade-off, blames others for failures, ignores tenant or security boundaries.
