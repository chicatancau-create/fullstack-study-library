# 语言专项：Rust——所有权、生命周期与类型驱动设计

**层级：P2/P3 系统与高性能方向｜目标：默认 L1；系统岗位进入 L2/L3。**

## 本专项已收集资料

- [Rust 语言圣经](<../05-外部资料库/知识库/后端进阶/sunface/rust-course/README.md>)：系统查阅所有权、生命周期、类型抽象、错误处理、并发异步与 unsafe，配合本专项逐项做编译器和运行期实验。
- [PingCAP Talent Plan](<../05-外部资料库/知识库/系统设计/pingcap/talent-plan/README.md>)：以 TP 201 递增实现网络化、并行、异步 KV 存储，再按能力进入 TP 202 的 Raft 与分布式事务项目。
- [Project Based Learning](<../05-外部资料库/知识库/全栈路线/practical-tutorials/project-based-learning/README.md>)：从 Rust 分区选择链表、文本编辑器、操作系统或 WASM 项目，补充所有权、资源生命周期与 unsafe 边界的综合实践。

> 使用提示：先独立实现，再对照资料中的思路与答案；语言、工具链和框架版本请回官方文档复核。返回 [[../05-外部资料库/资料索引|资料索引]]。

## 1. 执行模型与边界

- Rust 通常经编译生成原生代码，强调所有权、借用和类型约束在编译期排除一类内存与数据竞争问题。
- 编译器保证不等于业务正确、无死锁、无逻辑竞态、无泄漏或无 unsafe 风险。
- 适合系统工具、服务、WASM、嵌入式和性能敏感组件；学习成本来自模型变化，不应只为热度迁移全部服务。

## 2. 值、所有权与可变性

- 变量默认不可变；`mut` 控制绑定/可变借用，不等于线程安全。
- move、Copy、Clone 的区别；复制成本与语义不同，不能为消除错误全部 `.clone()`。
- 所有权、借用、`&T/&mut T`、借用规则和生命周期；生命周期标注描述关系，通常不是主动延长对象生命。
- 切片、字符串 `String/str`、Vec/数组、元组、结构体和枚举。
- `Drop` 的清理作用与 `mem::forget/ManuallyDrop` 的边界；Rust 仍可能泄漏资源。
- 内部可变性 Cell/RefCell/Mutex/RwLock 按场景选择，运行期借用检查 panic 也属于失败路径。

## 3. 函数、模式与抽象

- 表达式导向、match 穷尽性、if let/let-else 和解构。
- enum 建模状态，避免用多个可矛盾布尔字段表达非法状态。
- trait、泛型、关联类型、trait object、静态/动态分派和对象安全。
- 迭代器的惰性、适配器、collect 和错误处理；不要把所有逻辑写成不可读长链。
- 生命周期、自动解引用、Deref 与转换 trait 的隐式行为需要能解释。

## 4. 错误与资源

- `Option<T>` 表达可能无值，`Result<T,E>` 表达可恢复失败，panic 用于不可恢复/编程错误边界。
- `?` 的传播和错误转换，库与应用的错误类型策略不同。
- 不用 `unwrap/expect` 吞掉可预期外部失败；必须 panic 时写清不变量。
- Drop/RAII 管理文件、锁和连接；异步取消时也要验证清理。
- 关闭、超时、部分写入和回滚是业务协议的一部分，不由编译器自动生成。

## 5. 模块、依赖与构建

- crate、module、visibility、workspace、feature 和条件编译。
- Cargo.lock 在应用/库中的策略按项目约定；依赖版本、MSRV、feature 副作用和许可证需要审查。
- build.rs、proc macro 和代码生成增加构建与安全边界，不作为初学默认。
- FFI、cbindgen/绑定和平台 ABI 由系统方向选学。

## 6. 并发与异步

- `Send/Sync` 表达跨线程移动/共享约束；`Arc<Mutex<T>>` 不是通用默认答案。
- scoped threads、channel、消息传递和共享状态的取舍。
- 数据竞争可被类型系统大量减少，但死锁、活锁、逻辑竞态、资源饥饿仍要测试。
- async/.await、Future、executor、task 取消与背压；异步不等于自动并行。
- `tokio/async-std` 等按项目选一套；阻塞操作不能直接塞入异步执行器关键路径。

## 7. unsafe、测试与诊断

- unsafe 块的意义是人工承担不变量，不是“禁止优化”；最小化边界并写 Safety 论证。
- raw pointer、别名、生命周期、FFI 和未初始化内存可用 Miri 等辅助检查。
- 单元/集成/doc test、断言和属性测试覆盖类型无法表达的业务规则。
- cargo clippy/fmt、Miri、loom（并发模型检查）按项目选择。
- 使用 perf、flamegraph、heaptrack/等价工具定位 CPU、分配和锁竞争；跨平台工具按环境替代。

## 8. 教学项目与验收

### 最小项目

实现有界任务队列或append-only KV：

- 用 enum 表达状态和错误，不用字符串拼错误类型。
- 明确所有权、借用和文件刷新/关闭路径。
- 处理截断文件、重复键、队列满、取消和恢复。
- 编写单元/集成测试，运行 fmt/clippy。

### 深度实验

- 比较 channel 与共享状态的吞吐、尾延迟和实现复杂度。
- 为一个 FFI/unsafe 小边界写不变量与 Miri/等价验证。

### 通过标准

- [ ] 能解释 move、借用、生命周期和一次编译器拒绝的合法设计原因。
- [ ] 能用 enum/Result 表达业务失败，而非 panic 处理所有外部输入。
- [ ] 能说明 Send/Sync、取消与资源释放的关系。
- [ ] unsafe 若有，具备最小边界和验证；没有 unsafe 也能说明依赖风险。
- [ ] 有同口径基准，不以“Rust 必然最快”作为结论。

## 9. 常见误区

- 用大量 clone/Arc/Mutex 逃避所有权设计。
- 把编译通过当作协议正确和性能优秀证明。
- 为绕开借用检查制造不必要 unsafe。
- 异步任务无取消、无背压、无关闭顺序。
- 同时学习全部异步生态，未先理解 Future 与资源模型。

官方参考：[Rust 学习入口](https://www.rust-lang.org/learn)、[Cargo 文档](https://doc.rust-lang.org/cargo/)。版本、edition 与 MSRV 在项目中明确记录。
