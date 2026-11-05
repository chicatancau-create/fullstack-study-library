# 语言专项：Ruby——对象模型、块与 Rails 生产力

**层级：P3 认知/高生产力对照｜目标：默认 L1；Ruby/Rails 岗位进入 L2。**

## 1. 执行模型与边界

- Ruby 是动态、面向对象语言，具体解释/JIT、线程和 GC 行为随 CRuby/JRuby/TruffleRuby 等实现变化。
- 一切皆可消息调用的对象模型带来表达力，也带来动态分派与运行时错误边界。
- Rails 通过约定提高 CRUD 生产力，但业务复杂后仍需明确边界、事务和性能。

## 2. 值、对象与可变性

- 数字、字符串、Symbol、Array、Hash、nil 和 truthiness；Ruby 中 false/nil 之外的值通常被视为真。
- String 可变性与冻结、Symbol 的语义、编码和不可变键的权衡。
- Array/Hash 的引用、复制、默认块和共享默认对象。
- 方法参数、关键字参数、块传递和隐式返回。
- `==/eql?/equal?` 的差异和哈希键一致性。

## 3. 类、模块与消息分派

- class/module、继承、include/extend/prepend 和方法查找链。
- 鸭子类型和公开接口优先于类型名判断。
- block/proc/lambda 的参数、返回和闭包行为。
- `method_missing`、respond_to_missing? 和动态代理；必须保持 respond_to? 一致。
- 元编程、define_method、class_eval 等会改变查找与调试，限制在可证明收益处。

## 4. 错误、资源与依赖

- raise/rescue/ensure/retry 的语义，救援具体错误而非 StandardError 一把抓。
- 文件/连接使用块形式确保关闭；事务和外部副作用分别处理。
- Bundler/Gemfile.lock、Gem 的原生扩展、平台与版本兼容。
- 环境变量、秘密和日志过滤，不把生产配置写进 Gem 或仓库。
- Rake/CLI 任务的失败、重试和幂等。

## 5. Rails 请求与持久化

- 路由、控制器、模型、视图、参数过滤和中间件边界。
- Strong Parameters 防批量赋值，服务端授权不可省。
- Active Record 的关联、校验、回调、事务和 N+1。
- 校验不是永远可信的业务规则，竞态仍需数据库约束与锁。
- 迁移兼容、回滚、数据迁移和旧代码并行运行。
- 后台任务的队列、重试、幂等、超时和关闭。

## 6. 测试、性能与安全

- Minitest/RSpec 覆盖模型、请求和系统行为，避免只测 Rails 默认方法。
- Factory/fixture、数据库清理和时间控制，确保可重复。
- Bullet/查询日志发现 N+1，Profiler 分析分配、SQL 和视图。
- CSRF/XSS/SQL 注入、 mass assignment、开放重定向和模板输出分别验证。
- Rails 默认安全机制是辅助，不替代对象级授权和不可信输入边界。

## 7. 教学项目与验收

### 项目

小型 Rails 任务模块或纯 Ruby CLI：

- 明确模型、错误、持久化、校验和权限。
- 一个 N+1 或事务竞态有测量与修复。
- 请求/模型测试覆盖失败和越权。
- 依赖锁定、README 与可重复启动。

### 通过标准

- [ ] 能解释块、方法查找和一次动态分派问题。
- [ ] 能说明可变默认对象、引用和字符串/符号的边界。
- [ ] 能防止 N+1、批量赋值和一次事务竞态。
- [ ] 元编程有明确收益、接口和测试。
- [ ] 能独立启动、测试并诊断一个 Rails/Ruby 模块。

## 8. 常见误区

- 把“约定优于配置”理解为不需要设计与约束。
- 滥用 method_missing 和全局 monkey patch，导致调用链不可见。
- 用模型校验替代数据库唯一约束和并发控制。
- 只看请求平均耗时，忽略 N+1、视图和对象分配。
- 把旧 Rails 教程的行为套到当前版本。

官方参考：[Ruby 文档](https://www.ruby-lang.org/en/documentation/)、[Ruby on Rails Guides](https://guides.rubyonrails.org/)。
