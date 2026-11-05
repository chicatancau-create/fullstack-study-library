# 语言专项：Go——并发、服务与诊断

**层级：P1 云原生/后端方向｜目标：L2 生产服务；主修后端进入 L3 运行时诊断。**

## 1. 执行模型与边界

- Go 源码经工具链编译为可部署二进制，运行时负责调度、垃圾回收和栈管理；静态二进制不等于完全无运行时或所有依赖都静态。
- 语言刻意减少特性，工程深度集中在接口组合、错误、并发、资源和工具链。
- Go 适合网络服务、基础设施和云原生，不保证天然高吞吐或低延迟；实现与运行环境仍需测量。

## 2. 值、类型与数据布局

- 零值、短声明、类型推断、命名类型和显式转换；不依赖隐式数值转换。
- 值/指针、结构体、方法集和接收者；复制大结构体、锁或含资源的值要分析语义。
- slice 的指针/长度/容量、append 共享底层数组、扩容与别名；传参和截取不等于复制。
- map 无序、并发读写限制、零值 nil map 的读写差异。
- array/slice/map/string 的内存与分配直觉；`len` 是字节还是元素按类型区分，字符串按字节处理，文本需 rune/Unicode 策略。
- nil、空 slice、空字符串、零结构体与接口 nil 的区别。
- `==` 的可比较性；含 slice/map/func 的结构体不能直接比较。

## 3. 函数、接口与控制流

- 多返回值、命名返回的边界、defer/LIFO 和参数求值时机。
- error 是显式值；`fmt.Errorf/wrap/errors.Is/As` 用于上下文与分类，不用字符串匹配所有错误。
- interface 的小接口、隐式满足、组合和 nil interface/type nil 陷阱。
- 泛型约束和类型集合适度使用，优先清晰接口而非泛型化所有函数。
- `panic/recover` 只处理真正异常路径，不用作普通业务分支。
- init、包级变量与依赖顺序避免隐藏全局状态。

## 4. 资源与生命周期

- `defer Close()` 也要检查关闭错误；读取、写入、提交、回滚和关闭是不同协议步骤。
- context 传递 deadline、取消和请求范围值，不存可全局变数据，不把 context 放入长期存活结构。
- 连接池、文件、body、timer/ticker、goroutine 都需定义释放与停止条件。
- HTTP client/server 超时、body 关闭、连接复用、背压和优雅退出必须成组实现。

## 5. 包、模块与构建

- package 是设计边界；internal、导出标识、依赖方向和避免循环依赖。
- Go Modules、go.mod/go.sum、语义化版本、replace 的本地边界和依赖审计。
- `go test`、build tags、交叉编译、CGO 与目标平台差异。
- 不用全局 replace 隐藏依赖问题；发布记录工具链版本与构建参数。

## 6. 并发与调度

- goroutine 是运行时调度任务，不等于 OS 线程；GMP、系统调用和阻塞/非阻塞行为建立直觉。
- channel 的所有权、缓冲、关闭方、select/default 和循环退出；向已关闭 channel 发送会 panic。
- Mutex/RWMutex/atomic/Once/WaitGroup/Cond 的适用场景；锁复制、锁粒度和锁顺序必须验证。
- context cancel、WaitGroup、errgroup 管理派生任务；父任务返回不代表子任务已结束。
- 背压通过有界队列、信号量、超时和拒绝策略实现，不能只无限启动 goroutine。
- 数据竞争、逻辑竞态、死锁和 goroutine 泄漏分别构造实验。

## 7. 测试、性能与安全

- table-driven tests、t.Cleanup、并行子测试的共享状态、httptest 与真实数据库集成测试。
- `-race` 检测数据竞争但不是完整正确性证明；fuzz 用于解析与边界输入。
- benchmark 固定分配/数据/并发，使用 pprof/trace 分析 CPU、heap、block、mutex 和调度。
- 避免不安全的字符串/字节转换和反射 hack；反序列化限制大小与结构。
- 文件路径、命令参数、模板输出和 SQL 使用安全 API；秘密不进日志。

## 8. 教学项目与验收

### 项目

实现有界任务调度器：

1. 支持优先级、并发上限、context 取消、超时和关闭。
2. 结果与错误有明确归属，任务结束不泄漏 goroutine。
3. 暴露队列深度、运行数、失败数和 oldest-age。
4. 测试覆盖队列满、重复取消、任务 panic、超时和关闭中的提交。
5. 用 race、pprof 与负载测试验证。

### 深度迁移

用 Go 重写项目 03 一个高热接口，与 Node 使用同契约、同数据、同压测；比较实现与运维，不预设谁更快。

### 通过标准

- [ ] 能解释 slice 别名、接口 nil 和 defer 的一个真实错误。
- [ ] 能说明 channel 关闭责任、context 取消与 goroutine 退出关系。
- [ ] 至少一次竞态/泄漏有检测证据和回归。
- [ ] 服务包含超时、资源释放、优雅退出和背压。
- [ ] 构建、测试、诊断和部署可从干净环境复现。

## 9. 常见误区

- 把 goroutine 当免费线程，忽略调度、内存和取消。
- 忽略 slice 共享底层数组导致跨请求数据污染。
- 每个错误都包装，导致调用链噪音与分类丢失。
- 用 waitgroup 等待却不关闭 channel/取消子任务。
- 只比较单次 benchmark 平均值，忽略 GC、P99 和资源。

官方参考：[Go 文档](https://go.dev/doc/)、[Effective Go](https://go.dev/doc/effective_go)。并发与标准库行为按所用 Go 版本核对。
