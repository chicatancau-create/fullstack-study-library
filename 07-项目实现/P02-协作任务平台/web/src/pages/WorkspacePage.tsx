import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api, type Task } from '../api';
import { Empty, ErrorBox, Loading } from '../components/State';

export default function WorkspacePage() {
  const { id = '' } = useParams();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setError('');
    try {
      setTasks((await api.tasks(id)).tasks);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) setError('无权访问该工作区');
        else if (err.status === 401) setError('');
        else setError(err.message);
      } else setError('加载失败');
      setTasks([]);
    }
  }

  useEffect(() => { void load(); }, [id]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const { task } = await api.createTask(id, title.trim());
      setTasks((current) => [...(current || []), task]);
      setTitle('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function onChangeStatus(task: Task, status: Task['status']) {
    setError('');
    try {
      const { task: next } = await api.updateTask(task.id, status);
      setTasks((current) => (current || []).map((item) => (item.id === next.id ? next : item)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '更新失败');
    }
  }

  return (
    <main className="card">
      <p><Link to="/">← 返回工作区列表</Link></p>
      <h1>任务列表</h1>
      {error ? <ErrorBox message={error} /> : null}
      <form className="row" onSubmit={onCreate}>
        <input aria-label="新任务标题" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="新任务标题" />
        <button type="submit" disabled={submitting}>{submitting ? '创建中…' : '创建任务'}</button>
      </form>
      {tasks === null ? <Loading /> : tasks.length === 0 ? <Empty>暂无任务。</Empty> : (
        <ul className="list">
          {tasks.map((task) => (
            <li key={task.id} className="task-row">
              <Link to={`/tasks/${task.id}`}>{task.title}</Link>
              <select aria-label={`${task.title} 状态`} value={task.status} onChange={(e) => void onChangeStatus(task, e.target.value as Task['status'])}>
                <option value="todo">待办</option>
                <option value="in_progress">进行中</option>
                <option value="done">已完成</option>
              </select>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
