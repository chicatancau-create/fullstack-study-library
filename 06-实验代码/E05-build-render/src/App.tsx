export const items = [
  { id: 1, title: '构建产物' },
  { id: 2, title: 'SSR 对照' },
  { id: 3, title: '静态缓存' },
];

export function App() {
  return (
    <main>
      <h1>E05 构建与渲染</h1>
      <p>同一内容页分别用 CSR 与 renderToString 输出，比较首屏 HTML 与缓存策略。</p>
      <ul>
        {items.map((item) => <li key={item.id}>{item.title}</li>)}
      </ul>
    </main>
  );
}