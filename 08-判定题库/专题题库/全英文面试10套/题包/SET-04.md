# SET-04 · Payment Ledger

**Level:** Senior  **Duration:** 60 minutes  **Format:** 1 interviewer + 1 candidate  **Language:** English only

## Context

A ledger service records double-entry transactions and must be auditable and exactly-once for external callbacks.

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
| JS/TS | How do you prevent precision loss when summing ledger amounts? | Integer minor units or decimal library; never binary floats. |
| React | How would you present a reconciliation mismatch to an operator? | Side-by-side diff, drill-down, explicit resolution action, audit trail. |
| Node | How do you make an external callback handler exactly-once? | Signature, unique event id, transactional inbox, idempotent state machine. |
| SQL | How do you enforce that debits and credits balance per transaction? | Deferred constraint trigger or transactional check before commit. |
| System design | Design daily reconciliation between the ledger and the payment provider. | Cutoff, snapshots, diff buckets, manual review queue, metrics. |

Follow-up rule: ask "why" once and "what breaks" once per answer. Do not accept a list of tools without trade-offs.

## 3. Live coding (20 min)

### 3.1 Algorithm (10 min)

**Task:** Top K frequent elements

Given an array and k, return the k most frequent elements.

**Example:** [1,1,1,2,2,3], k=2 -> [1,2]

Look for: Hash map plus bucket sort or heap; discuss tie handling.

### 3.2 API design (10 min)

**Task:** Design `POST /ledger/entries` with idempotency and balance invariants.

Deliver: endpoint(s), request/response shape, status codes, validation, failure modes, and one thing you would monitor.

Look for: Validation, 409 on replay, atomic posting, audit fields.

## 4. Behavioral (10 min)

- Tell me about a correctness bug you caught before it shipped.
- How do you handle pressure from finance or compliance?
- Describe a decision you would make differently today.

## Interviewer notes

- Stop the candidate at the time box; note what was unfinished rather than letting the segment overrun.
- Record concrete quotes for the rubric, not impressions.
- Red flags: cannot name a trade-off, blames others for failures, ignores tenant or security boundaries.
