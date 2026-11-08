# SET-07 · Analytics Dashboard

**Level:** Mid  **Duration:** 60 minutes  **Format:** 1 interviewer + 1 candidate  **Language:** English only

## Context

A dashboard queries billions of events with filters, grouping and time ranges, and must stay responsive.

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
| JS/TS | How do you keep query parameter types in sync with the URL? | Single source of truth, schema validation, typed parser/serializer. |
| React | How do you prevent a slow chart request from overwriting a newer one? | Request id, abort previous, loading state per query key. |
| Node | How do you protect the API from expensive ad-hoc queries? | Query limits, allow-listed dimensions, timeouts, caching, rate limits. |
| SQL | How do you make a time-range aggregation fast on a large table? | Partitioning, covering index, pre-aggregation, avoid function on indexed column. |
| System design | Design pre-aggregation for daily and hourly rollups. | Idempotent jobs, late data, backfill, freshness contract. |

Follow-up rule: ask "why" once and "what breaks" once per answer. Do not accept a list of tools without trade-offs.

## 3. Live coding (20 min)

### 3.1 Algorithm (10 min)

**Task:** Group anagrams

Group strings that are anagrams of each other.

**Example:** ['eat','tea','tan'] -> [['eat','tea'],['tan']]

Look for: Sorted key or char count key; O(n*k log k) vs O(n*k).

### 3.2 API design (10 min)

**Task:** Design a metrics query API with pagination and limits.

Deliver: endpoint(s), request/response shape, status codes, validation, failure modes, and one thing you would monitor.

Look for: Dimension allow-list, max range, cursor pagination, error semantics.

## 4. Behavioral (10 min)

- Tell me about a time you optimized something users complained about.
- How do you balance speed and correctness in data products?
- Describe a disagreement about scope with a product manager.

## Interviewer notes

- Stop the candidate at the time box; note what was unfinished rather than letting the segment overrun.
- Record concrete quotes for the rubric, not impressions.
- Red flags: cannot name a trade-off, blames others for failures, ignores tenant or security boundaries.
