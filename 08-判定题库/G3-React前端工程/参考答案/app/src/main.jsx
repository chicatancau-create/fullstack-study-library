// 参考答案：修掉竞态、memo 依赖、可访问性。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { search } from './search.js';

function TaskRow({ task, onToggle }) {
  // 修复 2：依赖数组带上 onToggle，避免闭包读到旧值
  const toggle = useCallback(() => onToggle(task.id), [onToggle]);
  return (
    <li>
      <button type="button" onClick={toggle} aria-pressed={task.tag === 'done'}>
        {task.title}
      </button>
    </li>
  );
}

export function App() {
  const [query, setQuery] = useState('');
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toggles, setToggles] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    setLoading(true);
    search(query).then((hits) => {
      // 修复 1：只有“我仍是最后一次请求”才落地
      if (mine !== seq.current) return;
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
      {/* 修复 3：真 label + aria-live 结果区 */}
      <label htmlFor="q">搜索任务</label>
      <input id="q" value={query} onChange={(e) => setQuery(e.target.value)} />
      <p role="status" aria-live="polite">{loading ? '加载中…' : `待办 ${count} 个`}</p>
      <ul aria-live="polite">
        {tasks.map((t) => <TaskRow key={t.id} task={t} onToggle={onToggle} />)}
      </ul>
      <p data-testid="toggle-count">切换次数 {toggles}</p>
    </main>
  );
}

if (typeof document !== 'undefined' && document.getElementById('root')) {
  createRoot(document.getElementById('root')).render(<App />);
}
