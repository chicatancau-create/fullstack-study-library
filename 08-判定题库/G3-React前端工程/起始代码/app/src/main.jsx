// 起始代码：三个真实缺陷，等学习者修。
//   缺陷 1（竞态）：没有请求序号/取消，晚到的旧响应会覆盖新结果。
//   缺陷 2（渲染过期）：TaskRow 被 memo 包住，比较函数只比 id，
//          于是 tag 变化（点击切换后）被判定“没变”，按钮的 aria-pressed 停在旧值。
//   缺陷 3（可访问性）：输入框没有可访问名（没有 label / aria-label）。
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { search } from './search.js';

const TaskRow = memo(function TaskRow({ task, onToggle }) {
  const toggle = useCallback(() => onToggle(task.id), [onToggle]);
  return (
    <li>
      <button type="button" onClick={toggle} aria-pressed={task.tag === 'done'}>
        {task.title}
      </button>
    </li>
  );
  // 缺陷 2：只比 id，tag 变了也不重渲染
}, (prev, next) => prev.task.id === next.task.id);

export function App() {
  const [query, setQuery] = useState('');
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toggles, setToggles] = useState(0);

  useEffect(() => {
    setLoading(true);
    // 缺陷 1：谁后到谁生效
    search(query).then((hits) => {
      setTasks(hits);
      setLoading(false);
    });
  }, [query]);

  const onToggle = useCallback((id) => {
    setToggles((n) => n + 1);
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, tag: t.tag === 'done' ? 'todo' : 'done' } : t)));
  }, []);

  const count = useMemo(() => tasks.filter((t) => t.tag === 'todo').length, [tasks]);

  return (
    <main>
      <h1>任务列表</h1>
      {/* 缺陷 3：没有 label，也没有 aria-live */}
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索任务" />
      <p>{loading ? '加载中…' : `待办 ${count} 个`}</p>
      <ul>
        {tasks.map((t) => <TaskRow key={t.id} task={t} onToggle={onToggle} />)}
      </ul>
      <p data-testid="toggle-count">切换次数 {toggles}</p>
    </main>
  );
}

if (typeof document !== 'undefined' && document.getElementById('root')) {
  createRoot(document.getElementById('root')).render(<App />);
}
