# 语言专项：Swift——值语义、ARC 与 Apple 平台

**层级：P1 按岗位/P3｜目标：默认 L1；Apple 平台进入 L2。**

## 1. 执行模型与边界

- Swift 经编译运行，强调静态类型、值语义、协议和内存安全；具体优化与目标平台由工具链决定。
- Apple 应用还受主线程、应用/场景生命周期、签名、沙盒和商店规则约束。
- SwiftUI 与 UIKit/AppKit 的视图和生命周期不同，不能只用一种框架经验推断另一种。

## 2. 值、Optional 与类型

- struct/enum 的值语义与 class 的引用语义；赋值、参数和共享状态差异。
- copy-on-write 的集合行为与性能直觉，不假设每次赋值都深拷贝。
- Optional 表示可能无值，if let/guard let/可选链/空合并；避免强制解包处理外部输入。
- Int/Double 的精度、溢出和时间/日期使用；Codable 的键、日期和自定义解码。
- 泛型、关联类型、类型擦除和协议约束按项目需要学习。

## 3. 函数、协议与错误

- 参数标签、默认值、闭包、逃逸闭包和捕获列表。
- struct/class/actor 的选择，封装不变量和访问控制。
- protocol/extension 用于能力组合，关联类型与动态派发的边界。
- throws/try/Result 处理可恢复失败；错误类型保留上下文，不吞错误。
- defer 管理清理，guard 提前退出降低嵌套。

## 4. ARC 与资源

- ARC 自动管理引用计数，不等于所有资源自动释放或没有泄漏。
- strong/weak/unowned 的引用关系和循环引用；闭包/委托/Timer 是常见来源。
- 文件、流、任务和系统句柄由谁关闭需明确。
- 值类型虽减少共享引用，内部包含 class 时仍有共享生命周期。
- MainActor/actor 的隔离与对象发送需要结合并发模型分析。

## 5. 并发与 SwiftUI

- async/await 表达异步，Task/TaskGroup 管理结构化工作和取消。
- actor 保护隔离状态，MainActor 服务 UI；不要把重 CPU/阻塞 I/O 放主 actor。
- Sendable 与跨域数据传递，非 Sendable 共享需要审查。
- cancellation 是合作协议，任务内检查并清理，不保证自动停止阻塞 C API。
- SwiftUI 的 View 身份、状态归属、State/Observable/Observed/Environment 等按当前框架版本学习。
- 生命周期、后台、场景重建和草稿恢复必须真机验证。

## 6. 包、平台与发布

- Swift Package Manager、依赖版本、平台和构建配置。
- Codable/文件/Keychain/Core Data/SwiftData 的适用边界和迁移。
- URLSession 的超时、取消、错误、认证与敏感日志。
- 权限用途说明、最小化、拒绝与设置恢复；后台模式按平台规则。
- 证书、Provisioning Profile、签名、TestFlight/App Store 发布按当期流程执行。

## 7. 测试、诊断与安全

- XCTest/Swift Testing 按项目选择，覆盖模型、Optional、错误和异步取消。
- ViewInspector/等价 UI 测试不是万能，关键流程用 XCUITest 和真机。
- Instruments 的 Time Profiler/Allocations/Leaks 分析启动、内存和主线程。
- 深链、通知、Keychain、WebView 和文件输入均按不可信边界验证。
- 不将预览器或模拟器结果直接当作所有设备性能与生命周期证明。

## 8. 教学项目与验收

### 项目

SwiftUI 离线任务应用：

- 值语义模型、Codable 持久化、错误与草稿恢复。
- 列表/详情/编辑主路径，网络或系统能力可替换验证。
- 一个取消/超时/权限失败场景。
- 单元/UI 测试、性能基线、签名安装和已知限制。

### 通过标准

- [ ] 能解释值/引用语义、Optional 和一次 ARC 循环引用。
- [ ] 能说明 actor/MainActor 与任务取消的关系。
- [ ] 离线、权限拒绝、后台和恢复有测试。
- [ ] 有真机/模拟器明确区分及签名发布证据。
- [ ] 不把 SwiftUI 声明式视图当作自动状态与生命周期管理。

## 9. 常见误区

- 强制解包处理网络/文件输入，导致运行时崩溃。
- 闭包强引用 self 形成循环，误以为 ARC 会自动解决。
- 在 MainActor 做重任务，或把 Task 当无条件后台线程。
- 混淆 SwiftUI View 身份与状态，导致数据丢失或重复请求。
- 只做模拟器预览，忽略权限、签名和后台行为。

官方参考：[Swift 学习入口](https://www.swift.org/getting-started/)、[Apple Developer Documentation](https://developer.apple.com/documentation/)。
