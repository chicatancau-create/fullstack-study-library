# U03 盲测：独立未见任务

> 不附答案。要求独立实现并保留 `tsc --noEmit`、测试运行与失败用例的原始输出。

## 任务：学习记录解析与统计模块

实现 `src/study.ts`：

1. 类型 `StudyRecord`：`id`（非空字符串）、`title`（1–60 字符）、`minutes`（>=0 有限数）、`status`（`'draft' | 'done'`）、`tags`（字符串数组，可缺省为空）。
2. `parseRecord(input: unknown): StudyRecord`：逐字段运行时校验，失败抛 `ValidationError`（含 `field`）。
3. `parseRecords(input: unknown): StudyRecord[]`：非数组拒绝，逐条校验；错误信息要能指出第几条。
4. `summarize(records: readonly StudyRecord[]): { totalMinutes: number; doneCount: number; byTag: Record<string, number> }`：空数组返回全 0/空对象；重复 tag 计数正确。
5. `loadWithCancel(url: string, signal: AbortSignal): Promise<unknown>`：用 `fetch` 请求，`signal` 中止时抛 `AbortError`；网络失败与 HTTP 非 2xx 分开处理。

测试要求（`node:test`）：

- 合法记录、缺字段、错类型、超长/空 title、负数/NaN/Infinity、非法 status、非字符串 tags。
- `parseRecords` 的非数组与“第 2 条坏”错误定位。
- `summarize` 空数组、重复 tag、done 计数。
- `loadWithCancel`：中止、HTTP 500、网络失败（可用注入的 fetch 替身，不要打真实网络）。

**交付**：源码、`tsconfig.json`、测试、`tsc --noEmit` 与测试原始输出、未覆盖项（真实网络/浏览器）。不得用 `any` 或 `as StudyRecord` 绕过校验。

## 评分要点（自评）

- 外部输入是否真的逐字段校验，而不是只标类型。
- 错误是否带字段/索引，调用方能否定位。
- 取消是否协作式，是否区分“调用方停止等待”和“底层已撤销”。
- 测试是否覆盖失败与边界，而不只是 happy path。