# 语言专项：Dart——单线程异步与 Flutter

**层级：P1 按岗位/P3｜目标：默认 L1；Flutter 岗位进入 L2。**

## 1. 执行模型与边界

- Dart 支持开发期 JIT 与发布期 AOT 等模式，调试/性能/产物行为需分开。
- Dart 具备静态类型与空安全，同时保留 dynamic 和运行时边界。
- Dart 的 isolate 默认不共享可变堆内存，Flutter 的 UI 通常运行在主 isolate；异步不等于多线程。

## 2. 值、空安全与类型

- Object/Object?、dynamic、var/final/const、类型推断和运行时类型。
- final 与 const 的赋值/编译期差异；final 对象内部仍可能可变。
- Null safety、late、required、?/! 的使用；不要用 `!` 消除所有可空问题。
- int/double/num、字符串与 Unicode、List/Set/Map 的可变性和相等。
- record/pattern 等按所用版本学习，序列化需显式转换。

## 3. 函数、类与抽象

- 命名/位置/可选参数、箭头函数、闭包和 tear-off。
- class/mixin/abstract/interface、工厂构造和不可变建模。
- extension、泛型、协变边界和集合推导。
- Exception/Error、try/catch/finally、rethrow 和异步错误传播。
- 使用 dispose/close 等生命周期方法处理 controller、stream 和文件。

## 4. Future、Stream 与事件循环

- event queue/microtask 的基本顺序；`await` 让出执行但不创建新 isolate。
- Future 完成、错误、超时、取消的局限；Future 本身不一定可取消。
- async/await、Future.wait、并发上限和错误聚合。
- Stream 单订阅/广播、listen 暂停/取消、背压和 StreamController 生命周期。
- 防止过期响应覆盖、重复监听和页面销毁后的 setState。

## 5. Isolate 与平台通道

- Isolate 通过消息传递协作，适合 CPU 密集任务；启动、序列化与通信有成本。
- compute/Isolate.run 等简化方式按版本选择，复杂任务需端口、错误和关闭管理。
- Web/移动/桌面目标对 isolate、文件和线程能力支持不同。
- MethodChannel/EventChannel 的数据编码、线程、权限和原生生命周期。
- 原生插件版本和平台差异不能由 Dart 类型系统保证。

## 6. Flutter 声明式 UI

- Widget 描述配置，Element/RenderObject 承担挂载与渲染；Widget 不等于持久视图对象。
- Stateless/Stateful、State 生命周期、initState/dispose 和 mounted。
- 状态归属、不可变 Widget、key 对状态复用的影响。
- FutureBuilder/StreamBuilder 的快照、错误/空/加载和重复订阅。
- 路由、返回、后台、进程恢复、深色/字体与无障碍。

## 7. 测试、性能与发布

- 单元测试模型/异步，Widget 测试用户行为，集成测试验证真实导航和权限。
- fakeAsync/pumpAndSettle 的边界，持续动画/定时器可能导致测试不结束。
- Flutter DevTools 分析帧、内存、网络和布局；Debug/Profile/Release 分开。
- Android/iOS/桌面的签名、权限、安装和商店发布按当前平台流程。
- 性能结论注明设备、构建模式、数据量和是否首次运行。

## 8. 教学项目与验收

### 项目

Flutter 离线任务应用：

- 空安全模型、本地持久化、列表/详情/编辑。
- 一个 Stream/Future 数据流，处理错误、重复监听和销毁。
- 一个 CPU 任务移入 isolate 并测量前后体验。
- Widget/单元测试、权限或后台失败、签名安装。

### 通过标准

- [ ] 能解释空安全、事件循环与 Future/Stream 生命周期。
- [ ] 能说明 Widget/Element/State 的关系及 key 的影响。
- [ ] 能证明一个异步竞态或资源未取消问题已修复。
- [ ] 能区分 isolate 与 async 的适用场景。
- [ ] 有设备、构建模式和发布边界，不只交模拟器截图。

## 9. 常见误区

- 用 dynamic/! 绕过类型，导致运行时错误。
- 把 await 当后台线程，重计算仍阻塞 UI。
- 页面销毁后继续 setState，或重复创建 Stream 监听。
- 只看 Debug 模式动画，推断 Release 性能。
- 把 Dart 语法经验当作 Android/iOS 权限和发布能力。

官方参考：[Dart 文档](https://dart.dev/docs)、[Flutter 文档](https://docs.flutter.dev/)。
