import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api, type Comment, type Task } from '../api';
import { Empty, ErrorBox, Loading } from '../components/State';

export default function TaskPage() {
  const { id = '' } = useParams();
  const [task, setTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [error, setError] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setError('');
    try {
      const [taskBody, commentBody] = await Promise.all([api.task(id), api.comments(id)]);
      setTask(taskBody.task);
      setComments(commentBody.comments);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) setError('无权访问该任务');
        else if (err.status === 404) setError('任务不存在');
        else if (err.status !== 401) setError(err.message);
      } else setError('加载失败');
      setTask(null);
      setComments([]);
    }
  }

  useEffect(() => { void load(); }, [id]);

  async function onComment(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const { comment } = await api.addComment(id, body.trim());
      setComments((current) => [...(current || []), comment]);
      setBody('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function onChangeStatus(status: Task['status']) {
    if (!task) return;
    try {
      const { task: next } = await api.updateTask(task.id, status);
      setTask(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '更新失败');
    }
  }

  if (!task && !error) return <main className="card"><Loading /></main>;

  return (
    <main className="card">
      <p><Link to={task ? `/workspaces/${task.workspaceId}` : '/'}>← 返回</Link></p>
      {error ? <ErrorBox message={error} /> : null}
      {task ? (
        <>
          <h1>{task.title}</h1>
          <label className="row">
            状态
            <select aria-label="任务状态" value={task.status} onChange={(e) => void onChangeStatus(e.target.value as Task['status'])}>
              <option value="todo">待办</option>
              <option value="in_progress">进行中</option>
              <option value="done">已完成</option>
            </select>
            <span className="badge">v{task.version}</span>
          </label>
          <h2>评论</h2>
          <form className="row" onSubmit={onComment}>
            <input aria-label="新评论" value={body} onChange={(e) => setBody(e.target.value)} placeholder="写一条评论" />
            <button type="submit" disabled={submitting}>{submitting ? '提交中…' : '发表评论'}</button>
          </form>
          {comments === null ? <Loading /> : comments.length === 0 ? <Empty>还没有评论。</Empty> : (
            <ul className="list">
              {comments.map((comment) => (
                <li key={comment.id}>
                  <p>{comment.body}</p>
                  <small className="muted">{new Date(comment.createdAt).toLocaleString()}</small>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </main>
  );
}
