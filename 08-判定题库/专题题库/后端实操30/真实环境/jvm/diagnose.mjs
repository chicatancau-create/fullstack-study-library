import { execFileSync, execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dir = process.cwd();
const ev = path.join(dir, 'evidence');
fs.mkdirSync(ev, { recursive: true });
const results = [];
const evidence = { captured_at: new Date().toISOString(), java: null, checks: [] };
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  evidence.checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
}
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });

evidence.java = execSync('java -version 2>&1', { encoding: 'utf8' });

for (const file of ['GcLoad.java', 'Deadlock.java', 'Leak.java']) {
  run('javac', ['-d', '.', file]);
}

// E01 + JFR：真实 GC 日志与飞行记录
run('java', ['-Xmx64m', '-Xlog:gc:file=evidence/gc.log', '-XX:StartFlightRecording=filename=evidence/app.jfr,duration=10s', 'GcLoad'], { stdio: ['ignore', 'pipe', 'pipe'] });
const gcLog = fs.readFileSync(path.join(ev, 'gc.log'), 'utf8');
const gcPauses = (gcLog.match(/GC\(\d+\)/g) || []).length;
const pausesMs = [...gcLog.matchAll(/([\d.]+)ms/g)].map((m) => Number(m[1]));
const maxPause = pausesMs.length ? Math.max(...pausesMs) : 0;
const jfrPath = path.join(ev, 'app.jfr');
const jfrSize = fs.existsSync(jfrPath) ? fs.statSync(jfrPath).size : 0;
let jfrSummary = '';
try { jfrSummary = run('jfr', ['summary', jfrPath]); } catch (error) { jfrSummary = String(error.stderr || ''); }
fs.writeFileSync(path.join(ev, 'jfr-summary.txt'), jfrSummary);
check('E01 真实 GC 日志：至少 3 次停顿并给出最大停顿', gcPauses >= 3 && maxPause > 0, `pauses=${gcPauses} max_ms=${maxPause}`);
check('E01 JFR 记录非空且可解析', jfrSize > 0 && /jdk\.GC|JFR/.test(jfrSummary), `bytes=${jfrSize}`);

// E03：死锁 + jstack
const dead = spawn('java', ['-Xmx32m', 'Deadlock'], { stdio: ['ignore', 'pipe', 'pipe'] });
let deadOut = '';
dead.stdout.on('data', (d) => { deadOut += d.toString(); });
await new Promise((resolve) => {
  const timer = setInterval(() => {
    if (deadOut.includes('DEADLOCK_READY')) { clearInterval(timer); resolve(); }
  }, 50);
  setTimeout(() => { clearInterval(timer); resolve(); }, 8000);
});
const jstackOut = run('jstack', [String(dead.pid)]);
fs.writeFileSync(path.join(ev, 'jstack.txt'), jstackOut);
dead.kill();
const jstackText = fs.readFileSync(path.join(ev, 'jstack.txt'), 'utf8');
check('E03 jstack 识别 Java 级死锁与线程名', /Found one Java-level deadlock/.test(jstackText) && /deadlock-t1/.test(jstackText) && /deadlock-t2/.test(jstackText));

// E04：线程状态统计
const states = {};
for (const m of jstackText.matchAll(/java\.lang\.Thread\.State: ([A-Z_]+)/g)) states[m[1]] = (states[m[1]] || 0) + 1;
const stateCount = Object.values(states).reduce((a, b) => a + b, 0);
check('E04 jstack 线程状态可统计且包含阻塞态', stateCount >= 2 && (states.BLOCKED || 0) >= 2, JSON.stringify(states));

// E02：OOM + 堆快照
let oomText = '';
try {
  run('java', ['-Xmx32m', '-XX:+HeapDumpOnOutOfMemoryError', '-XX:HeapDumpPath=evidence/heap.hprof', 'Leak'], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 });
} catch (error) {
  oomText = String(error.stderr || error.message);
}
const heapPath = path.join(ev, 'heap.hprof');
const heapSize = fs.existsSync(heapPath) ? fs.statSync(heapPath).size : 0;
fs.writeFileSync(path.join(ev, 'oom.txt'), oomText);
check('E02 OOM 触发并生成非空堆快照', /OutOfMemoryError/.test(oomText) && heapSize > 0, `heap_bytes=${heapSize}`);

evidence.metrics = { gcPauses, maxPauseMs: maxPause, jfrBytes: jfrSize, threadStates: states, heapBytes: heapSize };
fs.writeFileSync(path.join(ev, 'jvm.json'), JSON.stringify(evidence, null, 2) + String.fromCharCode(10));
const failures = results.filter((r) => !r.ok).length;
console.log(failures === 0 ? `BACKEND30-E PASS ${results.length}/${results.length}` : `BACKEND30-E FAIL ${failures}/${results.length}`);
if (failures > 0) process.exitCode = 1;
