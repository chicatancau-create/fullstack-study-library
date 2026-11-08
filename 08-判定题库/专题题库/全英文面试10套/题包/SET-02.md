# SET-02 · E-commerce Checkout

**Level:** Mid-Senior  **Duration:** 60 minutes  **Format:** 1 interviewer + 1 candidate  **Language:** English only

## Context

A checkout service must never oversell inventory, must tolerate retries, and must handle duplicate payment callbacks.

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
| JS/TS | How do you model money in TypeScript and why? | Integer cents, branded type, no floating point arithmetic. |
| React | How would you design the checkout form state to survive a page refresh? | Persist draft, server-side cart, validation states, avoid storing card data. |
| Node | Compare optimistic and pessimistic stock deduction. When is each appropriate? | Optimistic with version/conditional update under low contention; row lock or atomic decrement under high contention. |
| SQL | How do you guarantee an idempotency key is processed once? | Unique constraint on key, insert first, return stored result on conflict. |
| System design | Design the payment callback path including duplicate delivery and out-of-order events. | Signature verification, idempotent state transitions, event log, reconciliation. |

Follow-up rule: ask "why" once and "what breaks" once per answer. Do not accept a list of tools without trade-offs.

## 3. Live coding (20 min)

### 3.1 Algorithm (10 min)

**Task:** Merge overlapping intervals

Given intervals [start, end], merge all overlapping ones and return sorted non-overlapping intervals.

**Example:** [[1,3],[2,6],[8,10]] -> [[1,6],[8,10]]

Look for: Sort by start, linear merge, handle touching intervals explicitly.

### 3.2 API design (10 min)

**Task:** Design `POST /checkout` with an idempotency key and inventory reservation.

Deliver: endpoint(s), request/response shape, status codes, validation, failure modes, and one thing you would monitor.

Look for: Key scope, 409/422 semantics, reservation expiry, replay returns same order.

## 4. Behavioral (10 min)

- Tell me about a bug that reached production. How did you find and fix it?
- Describe a time you pushed back on a deadline. What happened?
- How do you review a teammate's database migration?

## Interviewer notes

- Stop the candidate at the time box; note what was unfinished rather than letting the segment overrun.
- Record concrete quotes for the rubric, not impressions.
- Red flags: cannot name a trade-off, blames others for failures, ignores tenant or security boundaries.
