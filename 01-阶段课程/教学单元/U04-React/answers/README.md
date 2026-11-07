# U04 自测答案

1. **render/commit/Effect**：render 计算 UI（必须是纯的），commit 把变更写入 DOM；Effect 在 commit 之后运行，cleanup 在下一次 effect 前或卸载时运行。
2. **竞态**：旧请求晚到会写回已经过期的状态；根因是“结果属于哪个筛选”没有版本约束，不是网络本身慢。要给每次请求一个取消标记/版本号，并在写入前检查。
3. **只 abort**：底层可能不响应 abort，回调仍会到达；没有 `cancelled` 检查就会覆盖新状态。abort 是尽力而为，版本检查是最后防线。
4. **派生 vs state**：能由 props/state 纯计算的值（过滤、排序、计数）用派生；用户输入、跨渲染要保留的选择、服务端数据用 state。派生值再存一份会漂移。
5. **按 role/text 查询**：它测用户/辅助技术能感知的行为，不绑定内部实现；重构 DOM 结构时测试仍能保护真实需求。

## 练习提示

- 基础 1：排序是派生值（`useMemo` 可选），因为只由 records + sort 决定。
- 基础 2：空状态用 `role="status"`，错误用 `role="alert"`；重试按钮点击后重新请求。
- 边界 4：用 deferred 保存 5 个请求，按 5→1 逆序 resolve，只允许最后一次可见。
- 边界 5：`AbortError` 在 catch 里单独判断，不设置 error 状态。
- 边界 6：读 `getByRole('status')`/`getByRole('alert')`，不要只查 class。