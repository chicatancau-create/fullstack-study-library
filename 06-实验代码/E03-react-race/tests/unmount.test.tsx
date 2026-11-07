import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { GoodList } from '../src/GoodList';
import { deferred } from './helpers';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('E03 卸载', () => {
  it('卸载后 resolve 旧请求：不 setState、不报 act 警告，且 signal 已 abort', async () => {
    const pending = deferred<{ id: number; title: string }[]>();
    let captured: AbortSignal | undefined;
    const load = (_filter: 'a' | 'b', signal?: AbortSignal) => {
      captured = signal;
      return pending.promise;
    };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = render(<GoodList load={load} />);
    await waitFor(() => expect(captured).toBeDefined());
    unmount();

    expect(captured?.aborted).toBe(true);
    pending.resolve([{ id: 1, title: 'late' }]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(spy).not.toHaveBeenCalled();
  });
});