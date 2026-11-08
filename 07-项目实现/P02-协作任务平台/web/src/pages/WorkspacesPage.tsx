import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api, type Workspace } from '../api';
import { useAuth } from '../auth';
import { Empty, ErrorBox, Loading } from '../components/State';

export default function WorkspacesPage() {
  const { user, logout } = useAuth();
  const [items, setItems] = useState<Workspace[] | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setError('');
    try {
      setItems((await api.workspaces()).workspaces);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setError('你没有访问权限');
      else if (!(err instanceof ApiError && err.status === 401)) setError('加载失败，请重试');
      setItems([]);
    }
  }

  useEffect(() => { void load(); }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const { workspace } = await api.createWorkspace(name.trim());
      setItems((current) => [...(current || []), { ...workspace, role: 'owner' }]);
      setName('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="card">
      <header className="row">
        <div>
          <h1>我的工作区</h1>
          <p className="muted">{user ? `已登录：${user.email}` : ''}</p>
        </div>
        <button className="link" type="button" onClick={logout}>退出登录</button>
      </header>
      {error ? <ErrorBox message={error} /> : null}
      <form className="row" onSubmit={onCreate}>
        <input aria-label="新工作区名称" value={name} onChange={(e) => setName(e.target.value)} placeholder="新工作区名称" />
        <button type="submit" disabled={submitting}>{submitting ? '创建中…' : '创建工作区'}</button>
      </form>
      {items === null ? <Loading /> : items.length === 0 ? <Empty>还没有工作区，先创建一个。</Empty> : (
        <ul className="list">
          {items.map((workspace) => (
            <li key={workspace.id}>
              <Link to={`/workspaces/${workspace.id}`}>{workspace.name}</Link>
              <span className="badge">{workspace.role}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
