// 只导出两个函数：unusedDeadCode 不应进入产物，用来验证 tree-shaking。
export function usedSum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

export function unusedDeadCode(values: number[]) {
  return values.map((value) => `UNUSED_MARKER_7f3a:${value}`).join('|');
}
