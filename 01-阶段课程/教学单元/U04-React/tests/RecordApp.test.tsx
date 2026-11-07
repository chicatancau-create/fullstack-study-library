import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RecordApp } from '../src/RecordApp';
import type { Filter, Loader, Record } from '../src/types';

afterEach(cleanup);

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeLoader() {
  const pending = new Map<Filter, Deferred<Record[]>>();
  const loader: Loader = (filter) => {
    const d = deferred<Record[]>();
    pending.set(filter, d);
    return d.promise;
  };
  return { loader, pending };
}

const ALL: Record[] = [{ id: 1, title: 'all-1', minutes: 5, status: 'draft' }];

describe('RecordApp', () => {
  it('加载中显示 status，完成后显示列表', async () => {
    const { loader, pending } = makeLoader();
    render(<RecordApp loadRecords={loader} />);
    expect(screen.getByRole('status')).toHaveTextContent('加载中');
    pending.get('all')!.resolve(ALL);
    expect(await screen.findByText('all-1')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('旧筛选晚到不能覆盖新筛选', async () => {
    const { loader, pending } = makeLoader();
    render(<RecordApp loadRecords={loader} />);
    pending.get('all')!.resolve(ALL);
    await screen.findByText('all-1');

    fireEvent.click(screen.getByRole('button', { name: '进行中' }));
    await waitFor(() => expect(pending.has('draft')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: '已完成' }));
    await waitFor(() => expect(pending.has('done')).toBe(true));

    pending.get('done')!.resolve([{ id: 2, title: 'done-2', minutes: 6, status: 'done' }]);
    await screen.findByText('done-2');

    // 旧请求晚到：组件已 cleanup，必须忽略
    pending.get('draft')!.resolve([{ id: 3, title: 'draft-late', minutes: 7, status: 'draft' }]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText('draft-late')).not.toBeInTheDocument();
    expect(screen.getByText('done-2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '已完成' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('空结果显示“没有记录”', async () => {
    const { loader, pending } = makeLoader();
    render(<RecordApp loadRecords={loader} />);
    pending.get('all')!.resolve([]);
    expect(await screen.findByText('没有记录')).toBeInTheDocument();
  });

  it('失败显示 alert，重试后恢复', async () => {
    let calls = 0;
    const loader: Loader = async () => {
      calls += 1;
      if (calls === 1) throw new Error('boom');
      return ALL;
    };
    render(<RecordApp loadRecords={loader} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('boom');

    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('all-1')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});