const TASKS = {
  1: {
    title: '记录一次真实 HTTP 请求',
    desc: '用 curl 与浏览器各发一次请求，对照状态码、缓存、Cookie 与 CORS 的差异。',
  },
  2: {
    title: '只用键盘走完主路径',
    desc: '从首页到任务详情并保存，全程不碰鼠标；记录焦点顺序与可见焦点。',
  },
  3: {
    title: '用 gdb 定位一次越界写',
    desc: '在守护页保护下复现越界，用 gdb 定位到源码行，再用同一测试回归修复。',
  },
};

const form = document.getElementById('task-form');

if (form) {
  const params = new URLSearchParams(location.search);
  const id = params.get('id') || '1';
  const task = TASKS[id] || TASKS[1];

  document.getElementById('task-title').textContent = task.title;
  document.getElementById('task-desc').textContent = task.desc;
  document.title = `学习任务清单 · ${task.title}`;

  const title = document.getElementById('title');
  const priority = document.getElementById('priority');
  const done = document.getElementById('done');
  const errorBox = document.getElementById('form-error');
  const success = document.getElementById('success');
  const successText = document.getElementById('success-text');

  form.addEventListener('submit', event => {
    event.preventDefault();
    success.hidden = true;

    const value = title.value.trim();
    if (value.length < 1 || value.length > 60) {
      errorBox.textContent = '任务标题需要 1–60 个字符，请修改后再保存。';
      errorBox.hidden = false;
      title.setAttribute('aria-invalid', 'true');
      title.setAttribute('aria-describedby', 'title-hint form-error');
      title.focus();
      return;
    }

    errorBox.hidden = true;
    title.removeAttribute('aria-invalid');
    title.setAttribute('aria-describedby', 'title-hint');

    const labels = { high: '高', medium: '中', low: '低' };
    successText.textContent = `“${value}”已保存，优先级 ${labels[priority.value]}，${done.checked ? '已标记完成' : '未完成'}。`;
    success.hidden = false;
    success.focus();
  });
}