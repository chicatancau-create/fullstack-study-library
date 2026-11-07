import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';

describe('E05 构建与渲染', () => {
  it('CSR 组件渲染标题与列表', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('E05 构建与渲染');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('renderToString 首屏包含内容，不依赖客户端 JS', () => {
    const html = renderToString(<App />);
    expect(html).toContain('<h1>E05 构建与渲染</h1>');
    expect(html).toContain('构建产物');
    expect(html).toContain('静态缓存');
  });
});