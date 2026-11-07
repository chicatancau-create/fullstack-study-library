# U03：JavaScript / TypeScript 类型、运行时校验与异步顺序

> 前置：完成 U01、U02；会写基本函数、数组和对象。
>
> 本单元用 Node 24 的类型剥离运行 `.ts`，用 TypeScript 7 做 `--noEmit` 类型检查；不引框架。

## 1. 目标 / 非目标 / 产出

**目标**

- 解释作用域、闭包、`this`、原型与模块；知道 `let/const` 与 `var` 的差异。
- 解释事件循环：同步 → 微任务 → 宏任务；`await` 之后为什么先跑微任务。
- 用 `unknown` + 运行时校验处理外部数据，不用 `any` 或断言掩盖问题。
- 用严格 TS 的收窄、泛型、判别联合建模；知道类型在运行时被擦除。
- 写 `node:test` 单元测试，覆盖正常、失败、边界与取消。

**非目标**

- 不做类型体操，不实现编译器/解释器。
- 不教 React/Vue、构建工具或浏览器 DOM（U02/U04 负责）。
- 不声称“类型正确 = 运行时正确”；外部输入仍要校验。

**产出**

- 运行 `src/record.ts` 的类型检查、12 条测试与事件循环示例。
- 完成练习、自测与 [盲测](blind/README.md)；答案在 [answers](answers/README.md)。

## 2. 心智模型

JavaScript 是单线程事件循环：当前调用栈跑完，先清空微任务队列（Promise 回调、`queueMicrotask`、`await` 之后），再取一个宏任务（定时器、I/O）。所以 `setTimeout(0)` 不会插队到 `await` 前面。

TypeScript 的类型只存在于编译期。`parseRecord(input: unknown)` 里的类型标注不会替你在运行时检查 JSON；`unknown` 强制你先收窄，`any` 则让编译器闭嘴、把风险留到线上。运行时边界要写显式校验，并用测试证明。

闭包是函数记住定义时的词法作用域；`this` 由调用方式决定（普通调用、方法调用、`call/apply`、箭头函数继承外层）。原型是对象之间的委托链，`class` 只是语法糖。

## 3. 讲义

### 3.1 作用域、闭包与 `this`

```ts
function counter(): () => number {
  let n = 0;
  return () => ++n; // 闭包记住 n
}
```

`var` 是函数作用域且会提升；`let/const` 是块级作用域。循环里用 `var` 创建闭包会共享同一个变量，用 `let` 每次迭代新建绑定。

```ts
const obj = {
  name: 'u03',
  greet() { return this.name; },
};
const fn = obj.greet;
fn(); // this 丢失，严格模式下是 undefined
```

### 3.2 模块与事件循环

ESM 用 `import/export`，顶层 `await` 只在模块中可用。事件循环顺序：

```ts
setTimeout(() => console.log('timeout'), 0);
queueMicrotask(() => console.log('microtask'));
console.log('sync');
await Promise.resolve();
console.log('after-await');
```

输出顺序：`sync → microtask → after-await → timeout`。微任务在当前宏任务结束后、下一个宏任务前清空。

### 3.3 运行时边界：`unknown` 与收窄

```ts
export function parseRecord(input: unknown): StudyRecord {
  if (!isObject(input)) throw new ValidationError('root', '必须是对象');
  const id = input.id;
  if (typeof id !== 'string' || id.trim() === '') throw new ValidationError('id', '...');
  // ...
}
```

`unknown` 不能直接读属性；`typeof`/`Array.isArray`/自定义类型守卫把它收窄。校验失败抛带字段名的错误，调用方能定位。不要 `JSON.parse(raw) as StudyRecord`：断言不会检查字段。

### 3.4 严格 TS 的建模

```ts
type Result =
  | { ok: true; value: StudyRecord }
  | { ok: false; error: ValidationError };
```

判别联合让 `switch (result.ok)` 自动收窄。泛型用于“输入输出关系”，不是炫技：

```ts
function first<T>(items: readonly T[]): T | undefined {
  return items[0];
}
```

`noUncheckedIndexedAccess` 会把 `items[0]` 标成 `T | undefined`，逼迫处理空数组。

### 3.5 测试与失败

`node:test` 内置断言；`assert.throws`/`assert.rejects` 可以传谓词，验证错误类型与字段。测试要覆盖合法、缺字段、错类型、边界值、异步拒绝；不要只测 happy path。

## 4. 最小可运行示例

```bash
cd 01-阶段课程/教学单元/U03-JavaScript与TypeScript
bash scripts/run_unit.sh
cat evidence/run.txt
```

预期输出（形状）：

```text
typecheck exit=0
test exit=0
demo exit=0
typecheck: 0 errors
test: ℹ tests 12 ℹ pass 12 ℹ fail 0
demo: DEMO PASS
gate_failures: 0
```

实际输出见 `evidence/run.txt`、`typecheck.txt`、`test.txt`、`demo.txt`。

## 5. 常见错误

### 错误 1：用 `any` 或 `as` 让编译器闭嘴

- 现象：外部数据字段缺失/类型错，运行时才炸。
- 定位：搜 `any`/`as StudyRecord`；看边界函数是否校验。
- 修复：参数用 `unknown`，逐字段 `typeof`/`Array.isArray` 收窄，失败抛字段错误。
- 回归：坏输入测试必须抛 `ValidationError`，而不是 TypeError。

### 错误 2：浮动 Promise

- 现象：`doAsync();` 没有 `await`/`catch`，失败变成 unhandledRejection。
- 定位：搜调用点；监听 `unhandledRejection`。
- 修复：`await`、`return`、或显式 `.catch()`；批量用 `Promise.allSettled` 并检查结果。
- 回归：故意让异步失败，测试能观察到 reject。

### 错误 3：`this` 丢失

- 现象：把方法当回调传入后，`this` 不是原对象。
- 定位：打印 `this`；看调用形式。
- 修复：箭头函数、`bind`，或调用时 `obj.method()`。
- 回归：单测覆盖“方法被解构后调用”。

### 错误 4：以为 `setTimeout(0)` 会先于 Promise

- 现象：输出顺序与预期不符。
- 定位：记录事件循环顺序。
- 修复：记住微任务先于宏任务；需要顺序就显式 `await`。
- 回归：事件循环顺序测试。

### 错误 5：TS 类型通过就以为运行时安全

- 现象：`JSON.parse` 的数据通过类型断言，实际字段是 `undefined`。
- 定位：在边界打印原始值；加运行时校验。
- 修复：`unknown` + 校验函数；类型只描述“校验后”的形状。
- 回归：坏 JSON/缺字段测试。

## 6. 练习

### 基础

1. 给 `StudyRecord` 增加 `status: 'draft' | 'done'` 判别联合，校验非法状态。
2. 写 `parseRecords(input: unknown): StudyRecord[]`，拒绝非数组并逐条校验。
3. 用闭包写一个计数器，证明两个实例互不影响。

### 边界

4. 处理 `minutes` 为 `0`、超大数、`-0`、`NaN`、`Infinity`。
5. 让 `totalMinutes` 在空数组、单条、多条下都有测试。
6. 用 `AbortController` 写一个可取消的循环，取消后必须抛 `AbortError`。

## 7. 自测

1. `var`、`let`、`const` 的作用域与提升差异？
2. 闭包是什么？为什么循环里用 `var` 容易出错？
3. 微任务与宏任务的执行顺序？`await` 之后属于哪种？
4. `unknown` 与 `any` 的区别？为什么边界用 `unknown`？
5. TS 类型在运行时存在吗？`as` 会做校验吗？

答案见 [answers/README.md](answers/README.md)。

## 8. 独立未见任务（盲测）

见 [blind/README.md](blind/README.md)。要求独立实现一个“学习记录解析 + 统计”模块，带失败测试；不附答案。

## 9. M / E / G 映射

| 项 | 映射 | 说明 |
| --- | --- | --- |
| M04 JS/TS 与异步 | 部分 | 严格 TS、unknown 校验、事件循环、取消、测试 |
| M09 测试与调试 | 部分 | `node:test` 正常/失败/边界；无覆盖率门禁 |
| E02 | 复用 | 任务池的调度/取消见 E02；本单元不重复实现池 |
| G2 | 仅异步/类型子项 | 不代表 G2 通过 |

## 10. 官方资料与查阅日期

- [MDN JavaScript 指南](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide)：2026-11-07 查阅。
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)：2026-11-07 查阅；版本 7.0.2。
- [Node.js 事件循环](https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick)：2026-11-07 查阅；Node v24.15.0。
- 版本边界：Node 类型剥离不支持 enum/namespace 等需要运行时代码的语法；本单元不使用。

## 11. 证据

- `evidence/typecheck.txt`、`test.txt`、`demo.txt`、`run.txt`
- `evidence/manifest.json`：提交、命令退出码、证据 SHA-256