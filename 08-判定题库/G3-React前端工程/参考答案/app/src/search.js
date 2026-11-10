// 假的搜索服务：查询越短越慢，用来稳定复现“旧响应覆盖新响应”。
export const CATALOG = [
  { id: 'a1', title: 'alpha 任务', tag: 'todo' },
  { id: 'a2', title: 'alpine 任务', tag: 'done' },
  { id: 'b1', title: 'beta 任务', tag: 'todo' },
  { id: 'b2', title: 'bravo 任务', tag: 'done' },
];

export function search(rawQuery) {
  const query = rawQuery.trim().toLowerCase();
  const hits = query ? CATALOG.filter((x) => x.title.includes(query)) : CATALOG;
  // 短查询慢、长查询快：先发“a”，再发“al”，后到的“a”会覆盖“al”
  const delay = Math.max(120, 900 - query.length * 260);
  return new Promise((resolve) => {
    setTimeout(() => resolve(hits), delay);
  });
}
