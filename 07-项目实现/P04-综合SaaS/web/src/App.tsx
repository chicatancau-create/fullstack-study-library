import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, getToken, setToken, type AuditEvent, type Client, type Job, type Notification, type Tenant } from './api';

type Tab = 'clients' | 'jobs' | 'audit';

function errorText(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return '会话已过期，请重新登录';
    if (error.status === 403) return '当前角色无权执行该操作';
    return `请求失败：${error.code}`;
  }
  return '网络错误，请重试';
}

export default function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loggedIn, setLoggedIn] = useState(Boolean(getToken()));
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tab, setTab] = useState<Tab>('clients');
  const [clients, setClients] = useState<Client[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [clientName, setClientName] = useState('');
  const [followupFor, setFollowupFor] = useState<number | null>(null);
  const [summary, setSummary] = useState('');
  const [nextAt, setNextAt] = useState('');
  const [newTenant, setNewTenant] = useState('');

  const handleError = useCallback((caught: unknown) => {
    setError(errorText(caught));
    if (caught instanceof ApiError && caught.status === 401) {
      setToken('');
      setLoggedIn(false);
    }
  }, []);

  const loadTenants = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await api.tenants();
      setTenants(data.tenants);
      setTenant((current) => current ?? data.tenants[0] ?? null);
    } catch (caught) {
      handleError(caught);
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  const loadDetail = useCallback(async (target: Tenant) => {
    try {
      setLoading(true);
      setError('');
      const [c, j, n] = await Promise.all([api.clients(target.id), api.jobs(target.id).catch(() => ({ jobs: [] })), api.notifications(target.id)]);
      setClients(c.clients);
      setJobs(j.jobs);
      setNotifications(n.notifications);
      if (target.role === 'owner' || target.role === 'admin') {
        setAudit((await api.audit(target.id)).events);
      } else {
        setAudit([]);
      }
    } catch (caught) {
      handleError(caught);
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  useEffect(() => {
    if (loggedIn) void loadTenants();
  }, [loggedIn, loadTenants]);

  useEffect(() => {
    if (tenant) void loadDetail(tenant);
  }, [tenant, loadDetail]);

  const canWrite = tenant ? tenant.role !== 'viewer' : false;
  const canAdmin = tenant ? tenant.role === 'owner' || tenant.role === 'admin' : false;

  async function submitLogin(event: React.FormEvent) {
    event.preventDefault();
    try {
      setSubmitting(true);
      setError('');
      const data = await api.login(email.trim(), password);
      setToken(data.token);
      setLoggedIn(true);
      setPassword('');
    } catch (caught) {
      handleError(caught);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitRegister(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || password.length < 8) {
      setError('邮箱必填，密码至少 8 位');
      return;
    }
    try {
      setSubmitting(true);
      setError('');
      await api.register(email.trim(), email.split('@')[0], password);
      const data = await api.login(email.trim(), password);
      setToken(data.token);
      setLoggedIn(true);
      setPassword('');
    } catch (caught) {
      handleError(caught);
    } finally {
      setSubmitting(false);
    }
  }

  function logout() {
    setToken('');
    setLoggedIn(false);
    setTenant(null);
    setTenants([]);
  }

  async function createTenant(event: React.FormEvent) {
    event.preventDefault();
    if (newTenant.trim().length < 2) return;
    try {
      setSubmitting(true);
      const created = await api.createTenant(newTenant.trim());
      setNewTenant('');
      const data = await api.tenants();
      setTenants(data.tenants);
      setTenant(data.tenants.find((item) => item.id === created.id) ?? created);
    } catch (caught) {
      handleError(caught);
    } finally {
      setSubmitting(false);
    }
  }

  async function createClient(event: React.FormEvent) {
    event.preventDefault();
    if (!tenant || clientName.trim().length < 1) return;
    try {
      setSubmitting(true);
      await api.createClient(tenant.id, clientName.trim());
      setClientName('');
      await loadDetail(tenant);
    } catch (caught) {
      handleError(caught);
    } finally {
      setSubmitting(false);
    }
  }

  async function removeClient(clientId: number) {
    if (!tenant) return;
    try {
      setSubmitting(true);
      await api.deleteClient(tenant.id, clientId);
      await loadDetail(tenant);
    } catch (caught) {
      handleError(caught);
    } finally {
      setSubmitting(false);
    }
  }

  async function createFollowup(event: React.FormEvent) {
    event.preventDefault();
    if (!tenant || followupFor === null || summary.trim().length < 1) return;
    try {
      setSubmitting(true);
      await api.createFollowup(tenant.id, followupFor, summary.trim(), nextAt ? new Date(nextAt).toISOString() : '');
      setSummary('');
      setNextAt('');
      setFollowupFor(null);
      await loadDetail(tenant);
    } catch (caught) {
      handleError(caught);
    } finally {
      setSubmitting(false);
    }
  }

  async function createJob(event: React.FormEvent) {
    event.preventDefault();
    if (!tenant) return;
    try {
      setSubmitting(true);
      await api.createJob(tenant.id, 'reminder', `ui:${Date.now()}`, 5);
      await loadDetail(tenant);
    } catch (caught) {
      handleError(caught);
    } finally {
      setSubmitting(false);
    }
  }

  if (!loggedIn) {
    return (
      <main>
        <h1>P04 多租户 SaaS 控制台</h1>
        <p className="muted">多租户客户跟进 · 席位并发 · 审计 · 后台调度</p>
        {error && <p className="error" role="alert">{error}</p>}
        <form className="card" onSubmit={submitLogin}>
          <label>邮箱<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></label>
          <label>密码<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
          <div className="row">
            <button type="submit" disabled={submitting}>{submitting ? '登录中…' : '登录'}</button>
            <button type="button" className="secondary" disabled={submitting} onClick={submitRegister}>注册并登录</button>
          </div>
        </form>
      </main>
    );
  }

  return (
    <main>
      <header className="row between">
        <div>
          <h1>P04 多租户 SaaS 控制台</h1>
          <p className="muted">当前角色：{tenant ? `${tenant.role} · ${tenant.name}` : '未选择组织'}</p>
        </div>
        <button type="button" className="secondary" onClick={logout}>退出登录</button>
      </header>
      {error && <p className="error" role="alert">{error}</p>}

      <section className="card">
        <h2>我的组织</h2>
        {loading && <p className="muted">加载中…</p>}
        {!loading && tenants.length === 0 && <p className="muted">还没有组织，先创建一个。</p>}
        <ul className="grid">
          {tenants.map((item) => (
            <li key={item.id}>
              <button type="button" className={`tile ${tenant?.id === item.id ? 'active' : ''}`} onClick={() => setTenant(item)}>
                <strong>{item.name}</strong>
                <span>{item.plan} · 席位 {item.seat_limit} · {item.role}</span>
              </button>
            </li>
          ))}
        </ul>
        <form className="row" onSubmit={createTenant}>
          <input aria-label="新组织名称" placeholder="新组织名称" value={newTenant} onChange={(e) => setNewTenant(e.target.value)} />
          <button type="submit" disabled={submitting}>创建组织</button>
        </form>
      </section>

      {tenant && (
        <section className="card">
          <nav className="row" aria-label="视图切换">
            <button type="button" className={tab === 'clients' ? '' : 'secondary'} onClick={() => setTab('clients')}>客户</button>
            <button type="button" className={tab === 'jobs' ? '' : 'secondary'} onClick={() => setTab('jobs')}>后台任务</button>
            <button type="button" className={tab === 'audit' ? '' : 'secondary'} onClick={() => setTab('audit')}>审计</button>
          </nav>

          {tab === 'clients' && (
            <div>
              <h2>客户与跟进</h2>
              {clients.length === 0 && <p className="muted">暂无客户。</p>}
              <ul className="list">
                {clients.map((client) => (
                  <li key={client.id} className="item">
                    <div>
                      <strong>{client.name}</strong>
                      <span className="muted"> · 跟进 {client.followups} 条</span>
                    </div>
                    <div className="row">
                      <button type="button" className="secondary" disabled={!canWrite} onClick={() => setFollowupFor(client.id)}>新增跟进</button>
                      <button type="button" className="secondary" disabled={!canAdmin} onClick={() => removeClient(client.id)}>删除</button>
                    </div>
                  </li>
                ))}
              </ul>
              <form className="row" onSubmit={createClient}>
                <input aria-label="客户名称" placeholder="客户名称" value={clientName} onChange={(e) => setClientName(e.target.value)} disabled={!canWrite} />
                <button type="submit" disabled={!canWrite || submitting}>添加客户</button>
              </form>
              {!canWrite && <p className="muted">viewer 角色为只读，可查看客户但无法写入。</p>}

              {followupFor !== null && (
                <form className="card inner" onSubmit={createFollowup}>
                  <h3>新增跟进 #{followupFor}</h3>
                  <label>跟进内容<input value={summary} onChange={(e) => setSummary(e.target.value)} required /></label>
                  <label>提醒时间（可选）<input type="datetime-local" value={nextAt} onChange={(e) => setNextAt(e.target.value)} /></label>
                  <div className="row">
                    <button type="submit" disabled={submitting}>保存跟进</button>
                    <button type="button" className="secondary" onClick={() => setFollowupFor(null)}>取消</button>
                  </div>
                </form>
              )}
            </div>
          )}

          {tab === 'jobs' && (
            <div>
              <h2>后台任务与通知</h2>
              {canAdmin && (
                <button type="button" onClick={createJob} disabled={submitting}>投递提醒任务</button>
              )}
              {jobs.length === 0 ? <p className="muted">暂无任务。</p> : (
                <table>
                  <thead><tr><th>ID</th><th>类型</th><th>状态</th><th>优先级</th><th>尝试</th></tr></thead>
                  <tbody>
                    {jobs.map((job) => (
                      <tr key={job.id}><td>{job.id}</td><td>{job.kind}</td><td>{job.status}</td><td>{job.priority}</td><td>{job.attempts}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
              <h3>通知</h3>
              {notifications.length === 0 ? <p className="muted">暂无通知。</p> : (
                <ul className="list">
                  {notifications.map((item) => <li key={item.id} className="item"><span>{item.message}</span></li>)}
                </ul>
              )}
            </div>
          )}

          {tab === 'audit' && (
            <div>
              <h2>审计事件</h2>
              {!canAdmin && <p className="muted">仅 owner/admin 可见审计。</p>}
              {canAdmin && (audit.length === 0 ? <p className="muted">暂无审计。</p> : (
                <table>
                  <thead><tr><th>时间</th><th>动作</th><th>对象</th><th>操作者</th></tr></thead>
                  <tbody>
                    {audit.map((event) => (
                      <tr key={event.id}><td>{new Date(event.created_at).toLocaleString()}</td><td>{event.action}</td><td>{event.target}</td><td>{event.actor}</td></tr>
                    ))}
                  </tbody>
                </table>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
