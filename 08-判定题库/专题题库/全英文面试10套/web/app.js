import {
  DIMENSIONS,
  SEGMENTS,
  applyRedlines,
  buildRecord,
  drawSet,
  segmentAt,
  segmentPlan,
  weightedScore,
} from './core.mjs';

const SETS = Array.from({ length: 10 }, (_, i) => `SET-${String(i + 1).padStart(2, '0')}`);
const FOLLOW_UPS = [
  'Which failure mode would you test first, and why?',
  'What would you cut if you had half the time?',
  'Where does this design break at 10x traffic?',
  'What did you assume that could be wrong?',
];

const $ = (id) => document.getElementById(id);
const state = {
  set: null,
  startedAt: null,
  endedAt: null,
  elapsed: 0,
  timer: null,
  recorder: null,
  chunks: [],
  audioUrl: null,
  recording: false,
};

function renderSegments(activeId) {
  $('segments').innerHTML = segmentPlan()
    .map((s) => `<div class="segment ${s.id === activeId ? 'active' : ''}">${s.label} · ${s.minutes} min</div>`)
    .join('');
}

function renderScores() {
  $('scores').innerHTML = DIMENSIONS.map(
    (d) => `<div class="score-row"><label for="score-${d.id}">${d.label} (weight ${d.weight})</label>
      <span><input id="score-${d.id}" type="range" min="1" max="5" step="1" value="3">
      <output id="out-${d.id}">3</output></span></div>`,
  ).join('');
  for (const d of DIMENSIONS) {
    $(`score-${d.id}`).addEventListener('input', (e) => {
      $(`out-${d.id}`).textContent = e.target.value;
      updateScore();
    });
  }
}

function readScores() {
  return Object.fromEntries(DIMENSIONS.map((d) => [d.id, Number($(`score-${d.id}`).value)]));
}

function readRedlines() {
  return { codeNotRun: $('codeNotRun').checked, noTradeoff: $('noTradeoff').checked };
}

function updateScore() {
  try {
    const result = applyRedlines(readScores(), readRedlines());
    $('score-result').textContent = `Weighted score: ${result.final}${result.capped ? ' (capped at 2 by redline)' : ''}`;
  } catch (error) {
    $('score-result').textContent = `Weighted score: invalid (${error.message})`;
  }
}

function format(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function tick() {
  state.elapsed += 1;
  const seg = segmentAt(state.elapsed);
  $('time').textContent = format(state.elapsed);
  $('phase').textContent = seg.label;
  renderSegments(seg.id);
  if (state.elapsed >= 3600) stopTimer();
}

function startTimer() {
  if (state.timer) return;
  if (!state.set) draw();
  state.startedAt = state.startedAt || new Date().toISOString();
  state.timer = setInterval(tick, 1000);
}

function stopTimer() {
  clearInterval(state.timer);
  state.timer = null;
  state.endedAt = new Date().toISOString();
}

function resetTimer() {
  stopTimer();
  state.startedAt = null;
  state.endedAt = null;
  state.elapsed = 0;
  $('time').textContent = '00:00';
  $('phase').textContent = 'idle';
  renderSegments(null);
}

function draw() {
  state.set = drawSet(SETS);
  const followUp = drawSet(FOLLOW_UPS);
  $('set-label').textContent = `Set: ${state.set} · Follow-up: ${followUp}`;
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia) {
    $('record-status').textContent = 'Recording is not supported in this browser.';
    return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  state.chunks = [];
  state.recorder = new MediaRecorder(stream);
  state.recorder.ondataavailable = (e) => e.data.size && state.chunks.push(e.data);
  state.recorder.onstop = () => {
    const blob = new Blob(state.chunks, { type: 'audio/webm' });
    if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
    state.audioUrl = URL.createObjectURL(blob);
    $('download-record').disabled = false;
    stream.getTracks().forEach((t) => t.stop());
  };
  state.recorder.start();
  state.recording = true;
  $('record').disabled = true;
  $('stop-record').disabled = false;
  $('record-status').textContent = 'Recording... audio stays in this page until you download or clear it.';
}

function stopRecording() {
  state.recorder?.stop();
  state.recording = false;
  $('record').disabled = false;
  $('stop-record').disabled = true;
  $('record-status').textContent = 'Recording stopped. Not uploaded.';
}

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function save() {
  if (!state.set) draw();
  const record = buildRecord({
    set: state.set,
    scores: readScores(),
    redlines: readRedlines(),
    notes: $('notes').value,
    startedAt: state.startedAt || new Date().toISOString(),
    endedAt: state.endedAt || new Date().toISOString(),
    recording: state.recording,
  });
  downloadBlob(new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }), `${state.set}-self-score.json`);
}

function clear() {
  stopRecording();
  if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
  state.audioUrl = null;
  state.chunks = [];
  state.set = null;
  $('set-label').textContent = 'No set selected.';
  $('notes').value = '';
  $('codeNotRun').checked = false;
  $('noTradeoff').checked = false;
  $('download-record').disabled = true;
  $('record-status').textContent = 'Local record deleted.';
  resetTimer();
  updateScore();
}

$('draw').addEventListener('click', draw);
$('start').addEventListener('click', startTimer);
$('pause').addEventListener('click', stopTimer);
$('reset').addEventListener('click', resetTimer);
$('record').addEventListener('click', () => startRecording().catch((e) => {
  $('record-status').textContent = `Recording failed: ${e.message}`;
}));
$('stop-record').addEventListener('click', stopRecording);
$('download-record').addEventListener('click', () => {
  if (state.audioUrl) {
    const a = document.createElement('a');
    a.href = state.audioUrl;
    a.download = `${state.set || 'interview'}.webm`;
    a.click();
  }
});
$('save').addEventListener('click', save);
$('clear').addEventListener('click', clear);
$('codeNotRun').addEventListener('change', updateScore);
$('noTradeoff').addEventListener('change', updateScore);
$('notes').addEventListener('input', updateScore);

renderSegments(null);
renderScores();
updateScore();
console.log(`segments=${SEGMENTS.length} total=${segmentPlan().at(-1).end}s`);
