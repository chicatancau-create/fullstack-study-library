# SET-03 · Realtime Collaboration

**Level:** Senior  **Duration:** 60 minutes  **Format:** 1 interviewer + 1 candidate  **Language:** English only

## Context

A document editor supports concurrent edits from multiple users with presence and offline reconnect.

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
| JS/TS | How do you make a reducer deterministic when messages may arrive twice? | Sequence numbers, idempotent operations, dedupe by op id. |
| React | How do you avoid re-rendering the whole document on every remote keystroke? | Normalized state, memoized rows, selector subscriptions. |
| Node | What happens to in-flight edits when a WebSocket reconnects? Design the recovery. | Client buffer, server cursor/version, replay or resync. |
| SQL | How would you store document operations for replay? | Append-only op log with monotonically increasing version, periodic snapshots. |
| System design | Compare CRDT and OT for this product. What would you choose and why? | Trade-offs on complexity, latency, central authority, offline support. |

Follow-up rule: ask "why" once and "what breaks" once per answer. Do not accept a list of tools without trade-offs.

## 3. Live coding (20 min)

### 3.1 Algorithm (10 min)

**Task:** LRU cache

Implement an LRU cache with O(1) get and put and a fixed capacity.

**Example:** get(1) after capacity eviction returns null

Look for: Hash map plus doubly linked list; update recency on get.

### 3.2 API design (10 min)

**Task:** Design the WebSocket message contract for document operations.

Deliver: endpoint(s), request/response shape, status codes, validation, failure modes, and one thing you would monitor.

Look for: Message types, versioning, ack, error, resync, backpressure.

## 4. Behavioral (10 min)

- Tell me about the hardest technical trade-off you have made.
- How do you mentor a junior engineer who is stuck?
- Describe a time you had to say no to a feature request.

## Interviewer notes

- Stop the candidate at the time box; note what was unfinished rather than letting the segment overrun.
- Record concrete quotes for the rubric, not impressions.
- Red flags: cannot name a trade-off, blames others for failures, ignores tenant or security boundaries.
