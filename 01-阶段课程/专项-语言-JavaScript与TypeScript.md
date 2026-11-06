# 语言专项：JavaScript 与 TypeScript——值、异步与运行时边界

**层级：P0 Web 全栈底座｜目标：JS/TS L3；浏览器与 Node 能独立实现并诊断。**

## 本专项已收集资料

- [MDN Web Docs 内容镜像](<../05-外部资料库/知识库/前端与Node/mdn/content/README.md>)：官方文档源，覆盖 JavaScript 语言、Web API 与浏览器边界。
- [TypeScript 官方网站镜像](<../05-外部资料库/知识库/前端与Node/microsoft/TypeScript-Website/README.md>)：Handbook、tsconfig 与版本说明的官方内容源。
- [You Don't Know JS](<../05-外部资料库/知识库/前端与Node/getify/You-Dont-Know-JS/README.md>)：经典原理系列，用于深挖作用域、闭包、`this` 与异步。
- [JavaScript 面试题](<../05-外部资料库/题库/前端/greatfrontend/top-javascript-interview-questions/README.md>)：用于语言与运行时问题的自测和追问。

> 先自答、先完成本专项实验，再对照资料；语法、API 与版本行为回官方文档复核。返回 [[../05-外部资料库/资料索引|资料索引]]。

## 1. 执行模型

- JavaScript 由浏览器、Node、Bun、Deno 等运行时执行，通常涉及 JIT；语言语义与宿主 API 必须分开。
- 单线程执行一段 JS 不等于整个系统单线程：事件循环、任务队列、Worker、原生异步与进程共同工作。
- TypeScript 主要提供静态类型与编译工具，类型通常被擦除；运行时收到的 JSON、用户输入和库返回值仍是 JS 值。
- Node 的 libuv、模块系统、Buffer/Stream 与浏览器 DOM/Fetch/存储属于不同宿主边界。

## 2. 值、引用与类型转换

- 原始值与对象、赋值/参数引用、浅/深拷贝、冻结与不可变更新。
- `==/===`、truthy/falsy、隐式转换和 NaN；显式处理输入，避免依赖奇怪转换。
- Number 的 IEEE 754 精度与安全整数、BigInt 的边界；金额使用整数最小单位或十进制策略。
- string 的 UTF-16、Unicode code point/grapheme、规范化与排序；substring 长度不等于用户感知字符数。
- Array/Object/Map/Set/Date 的可变性和序列化差异；JSON 不保留 undefined、Date、Map 等类型信息。
- null/undefined、可选链与空值合并，避免把 0/false 当缺失。

## 3. 函数、原型与模块

- 作用域、闭包、变量提升、let/const/var、暂时性死区。
- `this` 由调用方式决定；箭头函数、bind/call/apply 和回调丢失上下文。
- 原型链、class 语法与组合，不把所有共享行为塞进全局原型。
- 高阶函数、迭代器、生成器、惰性求值和资源关闭。
- ESM/CJS、循环依赖、live binding、动态导入和打包器解析差异。

## 4. 异步与错误

- 任务/微任务、Promise 状态与链式传播；`async` 函数总返回 Promise。
- `Promise.all/allSettled/race` 的用途与失败差异；无界并发会压垮下游。
- AbortController 的信号传播、超时、取消、重复请求和过期响应覆盖。
- 网络失败、HTTP 非 2xx、解析失败和业务失败分别处理。
- Error cause、自定义错误、同步 throw 与 Promise reject；不能吞掉拒绝。
- 背压、队列、重试预算、幂等与清理必须组合。

## 5. TypeScript 类型系统

- 结构化类型、推断、字面量、联合/交叉、判别联合与控制流收窄。
- 泛型约束、条件类型、映射类型和工具类型用于表达真实约束，不做无法维护的类型体操。
- `unknown` 优于 any；类型断言只缩小承诺范围，不证明数据正确。
- 接口/类型别名、声明合并、声明文件与第三方类型边界。
- `strict`、模块解析、目标输出、项目引用和 tsconfig 对构建的影响。
- 使用 schema 校验外部输入，并从校验结果推导类型；API 类型与数据库类型不能假装永远一致。

## 6. 包、构建与运行时生态

- npm scripts、依赖分类、SemVer、锁文件和包管理器一致性。
- Vite/打包器的转译、Tree Shaking、动态导入、source map 与环境变量暴露。
- Node 的进程、信号、文件、流、背压、Buffer 与优雅退出。
- Bun/Deno 的兼容、权限与部署差异见 [[专项-运行时-NodeBunDeno|运行时比较]]，不能假设所有 npm 包跨运行时等价。

## 7. 测试、性能与安全

- 单元测试验证纯逻辑，组件测试验证行为，API 测试覆盖真实边界，E2E 只保留关键路径。
- fake timers、随机输入、异步竞态和主动破坏测试，避免只测 happy path。
- 浏览器长任务、渲染、网络瀑布与内存；Node CPU/heap/event-loop delay/句柄诊断。
- XSS、原型污染、危险 HTML/动态执行、路径/命令/SQL 注入和秘密前端暴露。
- 所有性能结论区分引擎、运行时、设备和冷/热缓存。

## 8. 教学项目与验收

### 项目

实现有界异步任务库 + 学习记录 CLI：

- 支持并发上限、超时、取消、重试和错误分类。
- 使用判别联合表达命令，外部 JSON 先校验。
- 测试空输入、损坏 JSON、重复、取消、过期响应和资源释放。
- 构建/测试命令可复现，类型检查无 any 泄漏到公共边界。

### 通过标准

- [ ] 能解释闭包、this、原型、引用和一次隐式转换问题。
- [ ] 能画出一段代码的任务/微任务顺序并验证。
- [ ] 能说明 TS 类型在哪里失效以及如何运行时校验。
- [ ] 能诊断一次请求竞态或 Node 资源未释放。
- [ ] 能区分语言、浏览器、Node 和打包器各自负责的故障。

## 9. 常见误区

- 把 async/await 当成自动并行，或忽略 Promise rejection。
- 用 any/断言让编译器闭嘴，却没有数据验证。
- 把 TS 类型当运行时安全，把框架状态当业务不变量。
- 用浅拷贝修改嵌套共享状态，导致跨请求污染。
- 把浏览器、Node、Bun、Deno 的 API 和性能结果混为一谈。

官方参考：[MDN JavaScript](https://developer.mozilla.org/docs/Web/JavaScript)、[TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)。
