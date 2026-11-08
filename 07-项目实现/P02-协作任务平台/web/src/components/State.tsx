import type { ReactNode } from 'react';

export function Loading({ label = '加载中…' }: { label?: string }) {
  return <p role="status" className="state loading">{label}</p>;
}

export function ErrorBox({ message }: { message: string }) {
  return <p role="alert" className="state error">{message}</p>;
}

export function Empty({ children }: { children: string }) {
  return <p className="state empty">{children}</p>;
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error ? <em role="alert" className="field-error">{error}</em> : null}
    </label>
  );
}
