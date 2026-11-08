# SET-08 · File Storage Pipeline

**Level:** Mid  **Duration:** 60 minutes  **Format:** 1 interviewer + 1 candidate  **Language:** English only

## Context

Users upload files that are scanned, thumbnailed and served through signed URLs with quotas.

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
| JS/TS | How do you model upload states in a type-safe way? | Union of states with allowed transitions, exhaustiveness. |
| React | How do you implement resumable uploads in the browser? | Chunking, retry, progress, cancel, integrity check. |
| Node | How do you stream a large upload without buffering it in memory? | Streams, backpressure, pipeline, size limits. |
| SQL | How do you track quota usage safely under concurrent uploads? | Atomic increment with check, reservation rows, periodic reconciliation. |
| System design | Design virus scanning between upload and availability. | Quarantine bucket, async scan, status transition, fail-closed. |

Follow-up rule: ask "why" once and "what breaks" once per answer. Do not accept a list of tools without trade-offs.

## 3. Live coding (20 min)

### 3.1 Algorithm (10 min)

**Task:** Implement an event emitter

Implement `on`, `once`, `off` and `emit` with correct listener removal.

**Example:** once fires only once; off removes listener

Look for: Map of event to listeners, snapshot during emit, error handling.

### 3.2 API design (10 min)

**Task:** Design a presigned upload flow with quotas.

Deliver: endpoint(s), request/response shape, status codes, validation, failure modes, and one thing you would monitor.

Look for: Two-step init/complete, content type limits, expiry, idempotency.

## 4. Behavioral (10 min)

- Tell me about a security issue you found or fixed.
- How do you handle a dependency that becomes unmaintained?
- Describe a time you had to learn a new domain quickly.

## Interviewer notes

- Stop the candidate at the time box; note what was unfinished rather than letting the segment overrun.
- Record concrete quotes for the rubric, not impressions.
- Red flags: cannot name a trade-off, blames others for failures, ignores tenant or security boundaries.
