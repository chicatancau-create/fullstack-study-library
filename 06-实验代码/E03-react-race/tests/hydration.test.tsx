import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { BadHydration, Clock, GoodHydration, serverSnapshot } from '../src/Hydration';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let root: Root | null = null;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = '';
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  vi.restoreAllMocks();
});

function mount(html: string) {
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);
  return container;
}

describe('SSR / hydration', () => {
  it('反例：客户端重新取时间与随机 ID，hydration 后 DOM 与 SSR 不一致', async () => {
    const serverHtml = renderToString(<Clock snapshot={{ now: 1_700_000_000_000, requestId: 'server' }} />);
    const container = mount(serverHtml);
    expect(container.querySelector('[data-testid="request-id"]')?.textContent).toBe('server');

    await act(async () => {
      try {
        root = hydrateRoot(container, <BadHydration />, { onRecoverableError: () => {} });
      } catch {
        // React 19 开发模式可能抛出可恢复错误，断言仍以 DOM 结果为准。
      }
    });

    expect(container.querySelector('[data-testid="request-id"]')?.textContent).not.toBe('server');
    expect(container.querySelector('time')?.getAttribute('datetime')).not.toBe(new Date(1_700_000_000_000).toISOString());
  });

  it('修复：服务端快照注入，hydration 无错误且内容一致', async () => {
    const snapshot = serverSnapshot(1_700_000_000_000, 'fixed-id');
    const serverHtml = renderToString(<Clock snapshot={snapshot} />);
    const container = mount(serverHtml);
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map((arg) => String(arg)).join(' '));
    });

    await act(async () => {
      root = hydrateRoot(container, <GoodHydration snapshot={snapshot} />);
    });

    expect(errors).toEqual([]);
    expect(container.querySelector('[data-testid="request-id"]')?.textContent).toBe('fixed-id');
    expect(container.querySelector('time')?.getAttribute('datetime')).toBe(new Date(snapshot.now).toISOString());
  });
});
