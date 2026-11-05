# 语言专项：Kotlin——空安全、协程与 JVM/Android

**层级：P1 按岗位/P3｜目标：默认 L1；JVM/Android 岗位进入 L2。**

## 1. 执行模型与边界

- Kotlin 可编译到 JVM 字节码，也有 JS/Native 目标；不同目标的标准库、并发和互操作不能混为一谈。
- 与 Java 互操作良好，但平台类型、注解、异常和空安全需要显式边界。
- Android 还受生命周期、主线程、资源、签名和商店约束；会 Kotlin 不等于会 Android。

## 2. 值、空安全与类型

- val/var、只读引用与对象可变性；val 不代表对象不可变。
- 可空/非空类型、`?.`、Elvis、`!!` 和平台类型；避免用 `!!` 消除设计问题。
- 基本类型、无符号数、数值转换和装箱成本；字符串与 Unicode 按 JVM 规则。
- data class 的 equals/copy/destructuring 和可变字段风险。
- sealed class/interface 表达受限状态，enum 表达简单枚举，避免非法状态组合。

## 3. 函数与抽象

- 默认/命名参数、扩展函数、顶层函数和作用域函数；不要嵌套 let/run/apply 到不可读。
- lambda、接收者 lambda、高阶函数和 inline；inline 可能改变非局部返回与二进制成本。
- 泛型、型变、星投影和 reified 的类型保留边界。
- 接口、委托、组合和对象表达式；优先表达不变量而非堆语法糖。
- 异常、runCatching/Result 与协程取消异常的区别，取消不能被吞掉。

## 4. 协程与 Flow

- suspend 函数不自动创建线程；协程由 dispatcher 调度，结构化并发决定子任务生命周期。
- CoroutineScope/SupervisorJob、launch/async、异常传播和取消合作。
- withContext、Dispatchers.IO/Default/Main、阻塞调用和线程切换。
- Job/Deferred 的 join/await、取消、超时和清理；GlobalScope 不作为默认。
- Flow 冷流、StateFlow/SharedFlow 热流、背压、缓冲和收集生命周期。
- Android viewModelScope/lifecycleScope 与界面销毁；数据流不能越过授权与生命周期边界。

## 5. 资源、互操作与构建

- use/Closeable、文件/连接/流的关闭和异常。
- Java checked exception、平台类型、getter/setter、SAM 和 JNI 的边界。
- Gradle Kotlin DSL、依赖、版本目录、构建变体和可复现构建。
- Android Context、Activity/Fragment/ViewModel 生命周期和泄漏；长任务不直接持有销毁页面。
- 房间数据库/WorkManager 等按项目选择，处理迁移、重试和约束。

## 6. 测试、诊断与安全

- JUnit、kotlinx-coroutines-test、虚拟时间与 dispatcher 替换。
- Flow 测试覆盖完成、异常、取消和背压，不只收集第一个值。
- Android UI/设备测试补充生命周期和权限，JVM 测试不能替代全部真机行为。
- 使用线程转储、Profiler、内存分析和网络记录定位主线程阻塞/泄漏。
- IPC/Intent 输入、WebView、文件权限和秘密存储按平台防护。

## 7. 教学项目与验收

### 项目

实现协程任务同步器或 Android 小页面：

- 有界并发、取消、超时、重试与错误分类。
- 本地持久化与离线状态，进程/页面重建有明确行为。
- 测试异常、取消、重复任务与资源释放。
- Android 方向额外验证权限拒绝、后台和签名安装。

### 通过标准

- [ ] 能解释空安全、val 可变性和一个 Java 互操作边界。
- [ ] 能说明结构化并发、取消和 dispatcher 选择。
- [ ] 能区分冷/热 Flow 及收集生命周期。
- [ ] 有测试、资源释放和平台/设备验证边界。
- [ ] 不把协程当免费线程，不用 GlobalScope 隐藏生命周期。

## 8. 常见误区

- 用 `!!` 和大量扩展函数掩盖类型与依赖问题。
- 认为 suspend 自动非阻塞，或在主线程做重 I/O。
- 吞掉 CancellationException，导致任务无法结束。
- 把 Flow 当一次性回调，忽略背压和收集生命周期。
- 只看 JVM 测试就宣称 Android 生命周期和权限通过。

官方参考：[Kotlin 文档](https://kotlinlang.org/docs/)、[Kotlin 协程指南](https://kotlinlang.org/docs/coroutines-overview.html)、[Android 开发文档](https://developer.android.com/)。
