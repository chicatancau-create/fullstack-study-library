# SET-06 · Search and RAG Assistant

**Level:** Mid-Senior  **Duration:** 60 minutes  **Format:** 1 interviewer + 1 candidate  **Language:** English only

## Context

An internal assistant answers questions over tenant-scoped documents and must cite sources and refuse when unsure.

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
| JS/TS | How do you validate an LLM or search response before trusting it? | Schema validation, allow-listed fields, treat as untrusted input. |
| React | How do you render streaming answers with citations accessibly? | Incremental rendering, aria-live, stable citation anchors. |
| Node | How do you enforce tenant isolation in retrieval? | Tenant filter before scoring, never post-filter only, tests for leaks. |
| SQL | How would you combine vector and keyword search in PostgreSQL? | pgvector plus tsvector, hybrid ranking, explain plans. |
| System design | Design evaluation for this assistant with a golden set. | Retrieval recall, citation accuracy, refusal, injection, cost/latency. |

Follow-up rule: ask "why" once and "what breaks" once per answer. Do not accept a list of tools without trade-offs.

## 3. Live coding (20 min)

### 3.1 Algorithm (10 min)

**Task:** Search in rotated sorted array

Find the index of a target in a rotated sorted array in O(log n). Assume all elements are distinct.

**Example:** [4,5,6,7,0,1,2], target=0 -> 4

Look for: Identify sorted half, binary search on the sorted half, edge cases (single element, target not present, rotation at midpoint).

**Follow-up (optional, 2 min):** How would your algorithm change if duplicates are allowed? Discuss why the worst case degrades to O(n) and how to handle it.

### 3.2 API design (10 min)

**Task:** Design `POST /assistant/answer` with citations and refusal.

Deliver: endpoint(s), request/response shape, status codes, validation, failure modes, and one thing you would monitor.

Look for: Tenant scope, document ids, confidence policy, token budget, audit.

## 4. Behavioral (10 min)

- Tell me about a time you had to explain a complex system to a non-engineer.
- How do you decide whether an AI feature is ready to ship?
- Describe a mistake you made in an estimate.

## Interviewer notes

- Stop the candidate at the time box; note what was unfinished rather than letting the segment overrun.
- Record concrete quotes for the rubric, not impressions.
- Red flags: cannot name a trade-off, blames others for failures, ignores tenant or security boundaries.
