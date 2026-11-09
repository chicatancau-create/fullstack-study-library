import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { KeyedList, Parent, Remount } from '../src/lab/Reconcile';
import { MemoLabStable, MemoLabUnstable } from '../src/lab/Memo';
import { ProfiledCounter, profileLog, resetProfiles } from '../src/lab/Profiler';
import { countOf, resetCounts } from '../src/lab/counters';

beforeEach(() => {
  resetCounts();
  resetProfiles();
});

describe('reconciliation', () => {
  it('父组件更新：普通子组件重渲染，memo 子组件在同 props 下 bailout', () => {
    render(<Parent />);
    expect(countOf('plain')).toBe(1);
    expect(countOf('memo')).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'tick+1' }));
    expect(screen.getByTestId('tick')).toHaveTextContent('1');
    expect(countOf('plain')).toBe(2);
    expect(countOf('memo')).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'value+1' }));
    expect(countOf('plain')).toBe(3);
    expect(countOf('memo')).toBe(2);
  });

  it('key 随数据走：重排后输入状态跟着条目迁移', () => {
    const { rerender } = render(<KeyedList items={['A', 'B']} />);
    fireEvent.change(screen.getByLabelText('note-A'), { target: { value: 'x' } });
    rerender(<KeyedList items={['B', 'A']} />);
    expect((screen.getByLabelText('note-A') as HTMLInputElement).value).toBe('x');
  });

  it('key 用 index：重排后状态留在位置而不是条目上', () => {
    const { rerender } = render(<KeyedList items={['A', 'B']} indexed />);
    fireEvent.change(screen.getByLabelText('note-A'), { target: { value: 'x' } });
    rerender(<KeyedList items={['B', 'A']} indexed />);
    expect((screen.getByLabelText('note-A') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('note-B') as HTMLInputElement).value).toBe('x');
  });

  it('key 改变 = 重新挂载，组件状态被重置', () => {
    const { rerender } = render(<Remount nonce={1} />);
    fireEvent.change(screen.getByLabelText('note-remount'), { target: { value: 'x' } });
    expect((screen.getByLabelText('note-remount') as HTMLInputElement).value).toBe('x');
    rerender(<Remount nonce={2} />);
    expect((screen.getByLabelText('note-remount') as HTMLInputElement).value).toBe('');
  });
});

describe('memo 边界', () => {
  it('内联对象/函数让 memo 失效：父组件每次渲染都传新引用', () => {
    render(<MemoLabUnstable />);
    expect(countOf('object')).toBe(1);
    expect(countOf('callback')).toBe(1);
    expect(countOf('context')).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: /rerender:/ }));
    expect(countOf('object')).toBe(2);
    expect(countOf('callback')).toBe(2);
    expect(countOf('context')).toBe(1);
  });

  it('useMemo/useCallback 稳定引用后，memo 生效', () => {
    render(<MemoLabStable />);
    fireEvent.click(screen.getByRole('button', { name: /rerender:/ }));
    expect(countOf('object')).toBe(1);
    expect(countOf('callback')).toBe(1);
    expect(countOf('context')).toBe(1);
  });

  it('context 穿透 memo：Provider 值变化时 memo 子组件仍重渲染', () => {
    render(<MemoLabStable />);
    fireEvent.click(screen.getByRole('button', { name: 'theme' }));
    expect(countOf('context')).toBe(2);
    expect(countOf('object')).toBe(1);
    expect(countOf('callback')).toBe(1);
  });
});

describe('React Profiler', () => {
  it('记录每次提交的 phase、时长与触发原因', () => {
    render(<ProfiledCounter />);
    expect(profileLog).toHaveLength(1);
    const mount = profileLog[0]!;
    expect(mount).toMatchObject({ id: 'e05-lab', phase: 'mount', reason: 'initial' });
    expect(mount.actualDuration).toBeGreaterThanOrEqual(0);

    fireEvent.click(screen.getByRole('button', { name: 'n+1' }));
    expect(profileLog).toHaveLength(2);
    const last = profileLog[1]!;
    expect(last.phase).toBe('update');
    expect(last.reason).toBe('state:n+1');
    expect(last.commitTime).toBeGreaterThanOrEqual(mount.commitTime);
    expect(countOf('memo')).toBe(2);
    // 原因来自实验侧埋点（React 不暴露“为什么渲染”），不是官方 API。
  });
});
