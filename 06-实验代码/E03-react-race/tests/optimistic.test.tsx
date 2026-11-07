import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OptimisticList } from '../src/OptimisticList';
import { deferred } from './helpers';

afterEach(cleanup);

describe('E03 乐观更新', () => {
  it('保存成功：临时项被服务端结果替换', async () => {
    const saved = deferred<{ id: number; title: string }>();
    const load = async () => [];
    render(<OptimisticList load={load} save={() => saved.promise} />);
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('新记录'), { target: { value: '乐观标题' } });
    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    expect(screen.getByText('乐观标题')).toBeInTheDocument();

    saved.resolve({ id: 10, title: '乐观标题' });
    await screen.findByText('乐观标题');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('保存失败：回滚临时项并显示 alert', async () => {
    const saved = deferred<{ id: number; title: string }>();
    const load = async () => [];
    render(<OptimisticList load={load} save={() => saved.promise} />);
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('新记录'), { target: { value: '会失败' } });
    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    expect(screen.getByText('会失败')).toBeInTheDocument();

    saved.reject(new Error('save failed'));
    expect(await screen.findByRole('alert')).toHaveTextContent('save failed');
    expect(screen.queryByText('会失败')).not.toBeInTheDocument();
  });
});