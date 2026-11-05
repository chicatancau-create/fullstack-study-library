# 语言专项：C#/.NET——CLR、异步与企业应用

**层级：P2 企业、桌面与游戏方向｜目标：L2 生产服务；主修进入 L3 CLR 诊断。**

## 1. 执行模型与边界

- C# 编译为 IL，由 CLR/JIT 执行并配备 GC、类型系统和运行时库；AOT/单文件等部署方式另有边界。
- C#/.NET 不等于 Windows 桌面；ASP.NET Core、服务、桌面、Unity 和跨平台工具共享语言但宿主不同。
- 版本需区分 C# 语言、.NET 运行时、SDK 和框架库，不能只看 Visual Studio 版本。

## 2. 值、对象与类型

- 值类型/引用类型、struct/class、复制、装箱拆箱和内存成本。
- null、可空值类型、可空引用类型注解与运行时检查；注解不自动验证 JSON。
- record/class/struct、值相等与引用相等、with 表达式和不可变建模。
- 泛型在 CLR 中保留类型信息，与 Java 擦除不同；协变/逆变和约束按接口/委托理解。
- string 不可变、UTF-16 与 Unicode、Span/Memory 的租用与生命周期。
- DateTime/DateTimeOffset/TimeZoneInfo，避免本地时间隐式混用。

## 3. 函数、对象与 LINQ

- 封装、继承、接口、组合和多态；构造后不变量与只读属性。
- delegate、lambda、闭包、事件和生命周期，注销事件避免对象被意外保留。
- LINQ 延迟执行、重复枚举、副作用与物化时机。
- IEnumerable/IQueryable 的本地枚举与提供程序翻译差异，EF 查询不能默认全部在数据库执行。
- pattern matching、switch expression、deconstruction 用于清晰建模。

## 4. 错误与资源

- 异常类型、筛选、inner exception 和错误边界；不吞异常、不用异常控制普通流程。
- IDisposable/IAsyncDisposable、using/await using、连接/流/锁的释放。
- HttpClient 生命周期、连接池、DNS、超时和取消；不要无限新建或永久单例忽略连接问题。
- EF Core 的 DbContext 生命周期、追踪、并发令牌、事务与迁移。
- 配置、Options、秘密与用户机密/环境提供程序，秘密不写入 appsettings 公开文件。

## 5. 依赖、构建与中间件

- NuGet、csproj、PackageReference、锁定/集中版本和依赖漏洞。
- SDK-style 项目、发布配置、运行时标识、AOT/ trimming 兼容按项目验证。
- ASP.NET Core DI 生命周期：Singleton/Scoped/Transient； captive dependency 和并发访问。
- 中间件顺序、异常、认证授权、路由、模型绑定和 OpenAPI。
- 后台服务的取消、停止、重试和幂等，不因进程退出丢失关键状态。

## 6. async/await 与并发

- async 状态机、Task/ValueTask、完成与调度，不把 async 当新线程。
- await 的异常、WhenAll/WhenAny、取消传播、超时和清理。
- 同步上下文与 ConfigureAwait 的宿主差异；避免 `.Result/.Wait()` 造成死锁或线程饥饿。
- 并行不等于异步：CPU 任务使用 Parallel/Task.Run 时考虑线程池和取消。
- lock/SemaphoreSlim/Channel/并发集合用于共享状态和背压；集合线程安全不等于业务原子。
- async stream 的迭代、取消和释放需要测试。

## 7. 测试、诊断与安全

- xUnit/NUnit、TestServer、Testcontainers/真实数据库集成，Mock 不代替授权和事务验证。
- dotnet-counters/dump/trace、PerfView、Visual Studio 诊断按环境使用。
- 分析分配、GC、线程池饥饿、异常频率、锁竞争和 EF SQL。
- 防 Overposting、CSRF、XSS、注入、开放重定向、文件上传和错误泄露。
- Identity 只提供机制，资源级授权和租户过滤仍需服务端验证。

## 8. 教学项目与验收

### 项目

ASP.NET Core 任务 API：

- DTO 校验、资源授权、统一错误、OpenAPI 和取消。
- EF Core 迁移、并发令牌和真实数据库测试。
- 一个有界后台任务，支持重试、幂等和关闭。
- 修复一次 N+1 或 `.Result` 阻塞，并给出量化结果。

### 通过标准

- [ ] 能解释值/引用类型、可空边界和一次装箱/生命周期问题。
- [ ] 能说明 async 状态机、取消和同步等待风险。
- [ ] 能解释 DI/DbContext/HttpClient 生命周期。
- [ ] 服务具备权限、事务、测试、部署和诊断证据。
- [ ] 至少一次 EF 或线程池问题有根因和回归。

## 9. 常见误区

- 到处 async 却同步阻塞，或忽视取消和释放。
- 把 LINQ 当已执行查询，重复枚举造成多次 I/O。
- 将 DbContext 当线程安全单例，或将 HttpClient 无限创建。
- 只看 CLR 内存，不看原生内存、连接和句柄。
- 将模型绑定和 Identity 当作完整资源授权。

官方参考：[C# 文档](https://learn.microsoft.com/dotnet/csharp/)、[.NET 文档](https://learn.microsoft.com/dotnet/)。
