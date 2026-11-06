# 运行时专项：Node、Bun、Deno——JS/TS 宿主与兼容边界

**层级：Node P0；Bun/Deno P3｜目标：Node L3，其他运行时能写技术卡片并完成同域实验。**

## 本专项已收集资料

- [Node.js 官方网站镜像](<../05-外部资料库/知识库/后端进阶/nodejs/nodejs.org/README.md>)：官方站点内容源，用于查 Node 文档、版本与学习材料。
- [Node.js Best Practices](<../05-外部资料库/知识库/后端进阶/goldbergyoni/nodebestpractices/README.md>)：经典 Node 工程实践，覆盖错误、异步、测试、安全与生产运维。
- [前端与 Node 每日一题](<../05-外部资料库/题库/前端与Node/shfshanyue/Daily-Question/README.md>)：用于 Node、异步与工程问题的自测和追问。

资料边界：本节本地资料以 Node 为主，未收 Bun/Deno 官方镜像；后两者的权限、兼容与部署行为须回各自官方文档复核。

> 先自答、先完成同域运行时实验，再对照资料；API、兼容性与版本行为回官方文档复核。返回 [[../05-外部资料库/资料索引|资料索引]]。

## 1. 运行时而非语言

- JavaScript/TypeScript 语言语义与运行时提供的文件、网络、进程、权限和包解析不同。
- Node 使用 V8 与 libuv 等组件形成异步 I/O 和生态；Bun/Deno 不是“更快的 Node”这一句话可概括。
- 比较必须固定业务、代码、依赖、运行时版本、硬件、数据和测量方式。

## 2. Node 执行与资源模型

- 调用栈、任务/微任务、libuv 阶段、线程池和原生异步；CPU 密集 JS 会阻塞事件循环。
- Buffer/Stream 的 chunk、背压、pipeline、错误和销毁。
- 进程、信号、句柄、定时器、连接池与优雅退出。
- CommonJS/ESM、package exports、循环依赖和动态导入。
- Worker Threads、子进程和原生扩展用于 CPU/平台边界，不当作无限扩容。

## 3. 包、权限与构建

- npm scripts、依赖分类、lock、workspace、原生模块和脚本执行权限。
- `NODE_ENV`、环境变量、构建时/运行时配置与秘密暴露。
- TypeScript 通常需 transpile/typecheck；Node 原生类型支持按所用版本核对，不等同完整类型检查。
- 生产部署关注 Node 版本、glibc、原生 ABI、容器和可复现安装。

## 4. Bun 的核心模型

- Bun 集成运行时、包管理、打包和测试等工具，使用不同 JS 引擎与原生实现。
- 关注 Node API、npm 包、原生模块、全局对象和构建输出兼容，而非只验证启动。
- 对文件、HTTP、SQLite、测试和打包分别做项目内验证。
- 不以单次 Hello World 或启动时间推断长期稳定、内存和业务性能。

## 5. Deno 的核心模型

- Deno 强调安全权限和 Web 标准 API，同时提供 Node/npm 兼容能力；具体行为按版本核对。
- 文件、网络、环境、子进程和 FFI 等权限要最小化并记录。
- URL/本地/npm 依赖、缓存、锁文件与部署可复现性。
- 与 Node 的全局对象、Buffer、包解析和原生模块差异需要测试。

## 6. 同域对照实验

选择一个真实小服务：JSON API + 文件流 + 外部 HTTP 调用 + 测试。

| 维度 | 要验证的问题 |
| --- | --- |
| 兼容 | 语言、依赖、原生模块、全局 API 是否一致 |
| 错误 | 网络/解析/权限/进程退出如何表现 |
| 资源 | 文件、连接、流、Abort 与关闭是否完整 |
| 性能 | 启动、稳态吞吐、P95/P99、内存与句柄 |
| 工程 | 安装、锁文件、类型检查、测试和构建是否可复现 |
| 部署 | 二进制/容器、权限、秘密和日志是否满足目标环境 |

任何不兼容先记录事实与范围，不用“基本兼容”掩盖关键路径失败。

## 7. 验收

- [ ] 能解释 Node 事件循环、Stream 背压与一次资源泄漏。
- [ ] 能说明 TypeScript 编译/原生支持不等于运行时校验。
- [ ] Bun/Deno 至少完成一个真实依赖兼容实验，或明确仅做技术卡片。
- [ ] 对比报告使用同业务同环境，未测部分明确标注。
- [ ] Node 服务具备超时、取消、关闭、秘密和部署证据。

## 8. 常见误区

- 把运行时版本差异当成语言语义差异。
- 只看冷启动，不看稳态、内存和错误行为。
- 忽略 npm 包安装脚本、原生 ABI 与权限。
- 用 Deno/Bun 的局部特性直接替换生产 Node，缺少回归。
- 将 Node 的 Buffer 和全局 API 当作浏览器通用标准。

官方参考：[Node.js 文档](https://nodejs.org/docs/latest/api/)、[Bun 文档](https://bun.sh/docs)、[Deno 文档](https://docs.deno.com/)。
