export const SEGMENTS = [
  { id: 'intro', label: '自我介绍', minutes: 5 },
  { id: 'technical', label: '技术问答', minutes: 25 },
  { id: 'coding', label: '现场编码', minutes: 20 },
  { id: 'behavioral', label: '行为面试', minutes: 10 },
];

export const DIMENSIONS = [
  { id: 'pronunciation', label: 'Pronunciation', weight: 0.2 },
  { id: 'fluency', label: 'Fluency', weight: 0.2 },
  { id: 'technical', label: 'Technical accuracy', weight: 0.35 },
  { id: 'structure', label: 'Communication structure', weight: 0.25 },
];

export function segmentPlan() {
  let start = 0;
  return SEGMENTS.map((s) => {
    const item = { ...s, start, end: start + s.minutes * 60 };
    start = item.end;
    return item;
  });
}

export function segmentAt(elapsedSeconds) {
  const plan = segmentPlan();
  return plan.find((s) => elapsedSeconds >= s.start && elapsedSeconds < s.end) || plan[plan.length - 1];
}

export function drawSet(sets, random = Math.random) {
  if (!Array.isArray(sets) || sets.length === 0) throw new Error('sets must be non-empty');
  return sets[Math.floor(random() * sets.length)];
}

export function validateScores(scores) {
  for (const dim of DIMENSIONS) {
    const value = scores?.[dim.id];
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw new Error(`${dim.id} must be an integer 1-5`);
    }
  }
}

export function weightedScore(scores) {
  validateScores(scores);
  const total = DIMENSIONS.reduce((sum, dim) => sum + scores[dim.id] * dim.weight, 0);
  return Math.round(total * 100) / 100;
}

export function applyRedlines(scores, redlines) {
  const base = weightedScore(scores);
  const capped = redlines.codeNotRun || redlines.noTradeoff ? Math.min(base, 2) : base;
  return { base, final: Math.round(capped * 100) / 100, capped: capped !== base };
}

export function buildRecord({ set, scores, redlines, notes, startedAt, endedAt, recording }) {
  return {
    set,
    startedAt,
    endedAt,
    durationSeconds: Math.round((new Date(endedAt) - new Date(startedAt)) / 1000),
    scores,
    weighted: applyRedlines(scores, redlines),
    redlines,
    notes,
    recordingLocalOnly: Boolean(recording),
  };
}
