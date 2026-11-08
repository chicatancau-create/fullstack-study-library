import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api';
import { useAuth } from '../auth';
import { ErrorBox, Field } from '../components/State';

export default function LoginPage() {
  const { login, register, message, clearMessage } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const banner = message || ((location.state as { message?: string } | null)?.message ?? '');

  function validate() {
    const next: { email?: string; password?: string } = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) next.email = '请输入有效邮箱';
    if (password.length < 8) next.password = '密码至少 8 位';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    clearMessage();
    setServerError('');
    if (!validate()) return;
    setSubmitting(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password, name || email.split('@')[0]);
      navigate('/', { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        setServerError(error.status === 429 ? '尝试过于频繁，请稍后再试' : error.message);
      } else {
        setServerError('网络异常，请稍后重试');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="card auth">
      <h1>P02 协作任务平台</h1>
      <p className="muted">登录后管理你的工作区与任务</p>
      {banner ? <ErrorBox message={banner} /> : null}
      {serverError ? <ErrorBox message={serverError} /> : null}
      <form onSubmit={onSubmit} noValidate>
        <Field label="邮箱" error={errors.email}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />
        </Field>
        <Field label="密码" error={errors.password}>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" />
        </Field>
        {mode === 'register' ? (
          <Field label="昵称（可选）">
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        ) : null}
        <button type="submit" disabled={submitting}>{submitting ? '提交中…' : mode === 'login' ? '登录' : '注册'}</button>
      </form>
      <button className="link" type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {mode === 'login' ? '没有账号？去注册' : '已有账号？去登录'}
      </button>
    </main>
  );
}
