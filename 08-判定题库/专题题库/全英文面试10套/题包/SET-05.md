# SET-05 · Notification Platform

**Level:** Mid  **Duration:** 60 minutes  **Format:** 1 interviewer + 1 candidate  **Language:** English only

## Context

A notification service sends email, SMS and in-app messages with user preferences, retries and deduplication.

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
| JS/TS | How do you type a discriminated union for notification channels? | Tagged union, exhaustive switch, never check. |
| React | How would you build a preference center that saves optimistically? | Optimistic update, rollback on error, disabled state, a11y feedback. |
| Node | How do you bound concurrency when calling a slow provider? | Semaphore or queue, timeouts, circuit breaker, retry with jitter. |
| SQL | How do you store per-channel preferences efficiently? | One row per user/channel or JSON with constraints; index by user. |
| System design | Design fan-out for a message that must reach 100k users. | Queue, batching, provider rate limits, idempotency, dead letter. |

Follow-up rule: ask "why" once and "what breaks" once per answer. Do not accept a list of tools without trade-offs.

## 3. Live coding (20 min)

### 3.1 Algorithm (10 min)

**Task:** Debounce and throttle

Implement `debounce(fn, ms)` and `throttle(fn, ms)` with correct `this` and arguments.

**Example:** Rapid calls produce one trailing call for debounce

Look for: Timers, lastArgs, leading/trailing semantics, cleanup.

### 3.2 API design (10 min)

**Task:** Design `POST /notifications` with channel selection and dedupe.

Deliver: endpoint(s), request/response shape, status codes, validation, failure modes, and one thing you would monitor.

Look for: Dedupe key, preference check, 202 semantics, status endpoint.

## 4. Behavioral (10 min)

- Tell me about a time you improved reliability without new features.
- How do you prioritize when three teams ask for the same service?
- Describe feedback that changed how you work.

## Interviewer notes

- Stop the candidate at the time box; note what was unfinished rather than letting the segment overrun.
- Record concrete quotes for the rubric, not impressions.
- Red flags: cannot name a trade-off, blames others for failures, ignores tenant or security boundaries.
