# G3 故障变体（第二套抽测）

在答案上制造受控缺陷，确认自测脚本会失败；修复后再次通过。

## 应用（改 `参考答案/app/src/main.jsx`）

| 编号 | 注入缺陷 | 应失败断言 | 已实测输出 |
| --- | --- | --- | --- |
| M-R3 | 去掉 `if (mine !== seq.current) return;` | `R3 竞态保护` | `旧响应覆盖了新结果: alpha\|alpine\|beta\|bravo` |
| M-R4 | `TaskRow` 改回 `memo(..., (p,n) => p.task.id === n.task.id)` | `R4 memo 依赖` | `点击后 aria-pressed 没变: false -> false` |
| M-R5 | 删掉 `<label htmlFor="q">` 与 `input` 的 `id` | `R5 可访问性` | `输入框没有可访问名` |

这三条与上面函数题的 M-F1/M-F2 一起由 `scripts/mutation_check.mjs` 自动复现（共 5 条）：应用变体各自单独构建、单独跑 `grade-react.mjs`。

## 构建侧（改 `参考答案/app/vite.config.js`）

| 编号 | 注入缺陷 | 应失败断言 |
| --- | --- | --- |
| M-B2 | `base: '/'` | `B2 无绝对路径引用` |
| M-B4 | 引入一个 >400 kB 的依赖 | `B4 单 chunk ≤ 400 kB` |

这两条需手工验（会改变依赖树），记录方式同上。

## 函数题（改 `参考答案/index.mjs`）

| 编号 | 注入缺陷 | 应失败断言 |
| --- | --- | --- |
| M-F1 | 去掉 `if (id !== latest) return { stale: true ... }` | `旧响应被丢弃` |
| M-F2 | 去掉 `latest = id;`（永不更新序号） | `新请求生效` |

## 记录模板

```
变体编号：M-R3
缺陷描述：删掉请求序号比较，旧响应直接 setTasks
失败断言：R3 竞态保护
复现命令：node 自测脚本/grade-react.mjs <变体 app>
失败输出：FAIL R3 竞态保护: 旧响应覆盖了新结果: alpha 任务|alpine 任务|beta 任务|bravo 任务
修复后输出：checks=6 fails=0
```
