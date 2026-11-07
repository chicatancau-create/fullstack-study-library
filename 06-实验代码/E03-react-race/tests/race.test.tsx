import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BadList } from '../src/BadList';
import { GoodList } from '../src/GoodList';
import { makeLoader } from './helpers';

afterEach(cleanup);

async function switchToB() {
  fireEvent.click(screen.getByRole('button', { name: 'B' }));
}

describe('E03 竞态复现与修复', () => {
  it('反例：无 cleanup 时旧响应 A-late 覆盖 B（bug 复现）', async () => {
    const { loader, pending } = makeLoader();
    render(<BadList load={loader} />);

    // 初始 A 先不结算；切到 B 并结算 B，再让 A 迟到。
    await switchToB();
    await waitFor(() => expect(pending.has('b')).toBe(true));
    pending.get('b')!.resolve([{ id: 2, title: 'B-item' }]);
    await screen.findByText('B-item');

    pending.get('a')!.resolve([{ id: 3, title: 'A-late' }]);
    await screen.findByText('A-late'); // 旧响应覆盖新结果：这就是要复现的缺陷
    expect(screen.queryByText('B-item')).not.toBeInTheDocument();
  });

  it('修复：GoodList 忽略旧响应，B 保持', async () => {
    const { loader, pending } = makeLoader();
    render(<GoodList load={loader} />);

    await switchToB();
    await waitFor(() => expect(pending.has('b')).toBe(true));
    pending.get('b')!.resolve([{ id: 2, title: 'B-item' }]);
    await screen.findByText('B-item');

    pending.get('a')!.resolve([{ id: 3, title: 'A-late' }]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText('A-late')).not.toBeInTheDocument();
    expect(screen.getByText('B-item')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('aria-pressed', 'true');
  });
});