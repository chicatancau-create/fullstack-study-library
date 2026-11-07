/**
 * 极简断言/计数工具。输出格式与 E01 的 C 用例保持一致：
 *   ok N - 名称 / not ok N - 名称
 *   末尾一行：<label> checks=N fails=M : PASS|FAIL
 * 不引第三方依赖，便于把原始输出直接当证据存档。
 */

const state = { checks: 0, fails: 0, unhandled: 0, rejections: [] };

let bannerShown = false;

export function banner(label) {
  if (bannerShown) return;
  bannerShown = true;
  console.log(`# ${label}`);
  console.log(`# node ${process.version}  pid ${process.pid}  captured_at ${new Date().toISOString()}`);
  process.on('unhandledRejection', (reason) => {
    state.unhandled++;
    state.rejections.push(reason?.message ?? String(reason));
  });
}

export function check(name, condition, detail = '') {
  state.checks++;
  if (condition) {
    console.log(`ok ${state.checks} - ${name}`);
  } else {
    state.fails++;
    console.log(`not ok ${state.checks} - ${name}${detail ? `  ::  ${detail}` : ''}`);
  }
  return Boolean(condition);
}

export function eq(name, actual, expected) {
  const pass = Object.is(actual, expected);
  return check(name, pass, pass ? '' : `actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
}

export function near(name, actual, min, max) {
  const pass = Number.isFinite(actual) && actual >= min && actual <= max;
  return check(name, pass, pass ? '' : `actual=${actual} 期望区间=[${min}, ${max}]`);
}

export function atMost(name, actual, limit) {
  const pass = Number.isFinite(actual) && actual <= limit;
  return check(name, pass, pass ? '' : `actual=${actual} 上限=${limit}`);
}

export function info(text) {
  console.log(`# ${text}`);
}

/**
 * 给等待加硬上限：超时即判失败，防止「无界等待」被误当成通过。
 * 注意这只约束测试本身，不改变被测代码语义。
 */
export async function within(ms, fn, label = 'operation') {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 超过 ${ms}ms 未结算（无界等待）`)), ms);
  });
  try {
    return await Promise.race([Promise.resolve().then(fn), guard]);
  } finally {
    clearTimeout(timer);
  }
}

export function summary(label) {
  check('未产生 unhandledRejection', state.unhandled === 0, state.rejections.join(' | '));
  const verdict = state.fails === 0 ? 'PASS' : 'FAIL';
  console.log(`\n${label} checks=${state.checks} fails=${state.fails} : ${verdict}`);
  if (state.fails !== 0) process.exitCode = 1;
  return verdict;
}
