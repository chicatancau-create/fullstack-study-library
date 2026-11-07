# U03 自测答案

1. **var/let/const**：`var` 函数作用域、会提升、可重复声明；`let/const` 块级作用域、存在暂时性死区；`const` 只禁止重新绑定，不冻结对象内容。
2. **闭包**：函数记住定义时的词法环境。循环用 `var` 时所有回调共享同一个变量，循环结束后都是最后一个值；用 `let` 每次迭代创建新绑定。
3. **顺序**：当前宏任务 → 清空微任务 → 下一个宏任务。`await` 之后的代码是微任务；`setTimeout` 是宏任务。所以 `setTimeout(0)` 晚于 `await Promise.resolve()`。
4. **unknown vs any**：`unknown` 必须收窄后才能使用，编译器强制你处理类型；`any` 放弃检查。边界用 `unknown`，因为外部输入不可信。
5. **运行时不存在**：类型在编译/剥离后消失；`as` 只是编译期断言，不做任何运行时校验。必须在边界写 `typeof`/`Array.isArray`/自定义守卫。

## 练习提示

- 基础 1：用 `status: 'draft' | 'done'`，校验时 `status !== 'draft' && status !== 'done'` 抛字段错误。
- 基础 2：先 `Array.isArray(input)`，再 `input.map(parseRecord)`；`map` 会保留索引错误信息可自行包装。
- 边界 4：`Number.isFinite` 排除 `NaN/Infinity`；`-0 < 0` 为 false，需决定是否接受（本单元接受）。
- 边界 6：循环每步检查 `signal.aborted`，中止时抛 `DOMException('aborted','AbortError')`；测试用 `AbortController`。