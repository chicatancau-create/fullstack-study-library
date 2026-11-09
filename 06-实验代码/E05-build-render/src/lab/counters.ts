// 渲染计数：仅用于实验与测试观测，不参与生产逻辑。
export const renderCounts = new Map<string, number>();

export function bump(name: string) {
  renderCounts.set(name, (renderCounts.get(name) ?? 0) + 1);
}

export function countOf(name: string) {
  return renderCounts.get(name) ?? 0;
}

export function resetCounts() {
  renderCounts.clear();
}
