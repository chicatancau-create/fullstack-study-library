# 语言专项：Java——JVM、并发与企业工程

**层级：P1 企业后端方向｜目标：L2 企业模块；主修进入 L3 JVM 与生产诊断。**

## 1. 执行模型与边界

- Java 源码编译为字节码，由 JVM 类加载、解释/JIT 执行；JMM、JVM 内存区域、GC 和 JIT 是不同主题。
- JVM 提供跨平台运行模型，不等于字节码依赖、JNI、容器资源和操作系统行为完全一致。
- Java 适合复杂业务与企业生态；Spring 是框架，不能替代语言、并发、SQL 和运行时理解。

## 2. 值、对象与类型

- 基本类型/引用类型、装箱拆箱、整数溢出、浮点精度和字符串不可变性。
- 引用相等、`equals/hashCode` 契约及放入哈希容器后的可变性风险。
- 数组、集合与对象可变性；不可变对象需深层处理引用字段。
- null、Optional 和空集合的使用边界，不用 Optional 消除所有空值判断。
- 泛型、类型擦除、通配符、PECS 和运行时类型信息限制。
- record/sealed/interface 等按所用 LTS 学习，不将版本特性写成所有 JVM 都支持。

## 3. 类、函数与抽象

- 封装不变量、构造器校验、组合/继承和接口默认方法。
- 重写/重载、动态分派、协变返回和访问控制。
- 内部类/lambda 捕获、 effectively final 与对象生命周期。
- Stream 惰性、终端操作、副作用与 parallelStream 的共享线程池风险。
- 异常层级、受检/非受检、异常转换和原因链，不吞异常或只打印堆栈继续执行。

## 4. 资源与依赖

- try-with-resources 和 AutoCloseable；关闭顺序与异常抑制。
- JDBC 连接、语句、结果集、事务、线程和文件流由谁关闭。
- Maven/Gradle 主用一个：依赖 scope、传递依赖、冲突、BOM、可复现构建和制品。
- package/module 边界，避免循环依赖与随意 util 包。
- Spring DI/生命周期/AOP 代理、自调用与配置边界属于框架进阶，不从注解背起。

## 5. 集合与数据结构

- ArrayList/LinkedList、HashMap/TreeMap、HashSet、ArrayDeque 的复杂度与使用场景。
- HashMap 的哈希、容量、碰撞与并发限制；不要把实现细节固定到所有版本。
- ConcurrentHashMap、CopyOnWriteArrayList、BlockingQueue 的适用边界。
- 排序比较器一致性、自然排序与 equals 不一致导致的集合异常。
- 大量数据优先考虑流式/分页，不把全部结果装入内存。

## 6. JMM 与并发

- 原子性、可见性、有序性和 happens-before；`synchronized/volatile/final` 各自保证什么。
- volatile 不保证复合操作原子性；锁不仅保护变量，也保护业务不变量。
- synchronized/ReentrantLock/ReadWriteLock/StampedLock 按需求选择，锁顺序与超时。
- ExecutorService 的队列、线程数、拒绝、取消、关闭和任务异常；不要默认无界队列。
- CompletableFuture 的异常、取消、超时、组合与默认线程池。
- ThreadLocal 的线程复用泄漏；虚拟线程不消除锁、连接池和下游容量限制。
- 死锁、活锁、竞态、写偏差和数据库隔离属于不同层次，需要分别实验。

## 7. JVM、性能与诊断

- 堆/栈/元空间/直接内存和本地内存；OOM 不都只通过增大堆解决。
- 类加载、双亲委派及容器场景的例外，NoClassDefFoundError 与 ClassNotFoundException。
- GC 日志、JFR、线程转储、堆转储、JMC/async-profiler 按环境选择。
- JIT 预热、逃逸分析、装箱、分配率、字符串拼接和序列化成本。
- 容器 CPU/内存限制与 JVM 资源识别；压测包含预热和稳态。

## 8. 测试与安全

- JUnit、AssertJ、Mockito 只隔离需要隔离的边界；真实数据库用 Testcontainers。
- 并发测试重复交错、断点/日志/转储辅助，不把一次通过当无竞态。
- 反序列化、表达式、XML/XXE、路径、SQL、命令和模板输入分别防护。
- Bean Validation 不能替代服务端授权；异常与日志不泄露敏感信息。
- 依赖、签名制品、秘密与最小权限进入交付检查。

## 9. 教学项目与验收

### 项目

实现有界线程池或 LRU 缓存，再接入项目 02 的 Java 版本：

- 明确拒绝、取消、关闭、异常和并发策略。
- 用 JUnit 覆盖不变量、失败和并发交错。
- 用线程转储/JFR/GC 数据定位一个真实问题。
- 与简单执行器/无缓存方案比较吞吐、P99 和复杂度。

### 通过标准

- [ ] 能解释 equals/hashCode、泛型擦除和资源关闭的一个真实坑。
- [ ] 能说明 volatile 与锁、虚拟线程与下游容量的边界。
- [ ] 能阅读至少一种 JVM 诊断并形成根因证据。
- [ ] 生产模块具备真实数据库、权限、事务、测试与部署。
- [ ] 性能数字有版本、容器资源、预热、数据和原始结果。

## 10. 常见误区

- 用 synchronized 包裹所有方法，导致竞争与业务不一致并存。
- 用线程数增长解决下游瓶颈，或用无界队列隐藏过载。
- 把 Spring 事务、AOP 和数据库事务混为一谈。
- 用 H2 测试推断所有 MySQL 锁和方言行为。
- 只调整堆大小，不分析分配、泄漏和 GC 证据。

官方参考：[Java 学习入口](https://dev.java/learn/)、[JDK 文档](https://docs.oracle.com/en/java/javase/)。版本、JVM 实现与容器参数在实验记录中注明。
