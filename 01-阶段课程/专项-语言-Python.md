# 语言专项：Python——对象模型、异步与数据/AI

**层级：P1 自动化、数据与 AI 应用｜目标：L2 生产服务；主修进入 L3 解释器与性能诊断。**

## 本专项已收集资料

- [awesome-cs61a](<../05-外部资料库/知识库/AI与RAG/Ethan-Wang-dev/awesome-cs61a/README.md>)：利用带版本记录的 CS61A 作业、实验与项目训练抽象、递归、数据结构、面向对象、解释器和测试。
- [The Algorithms - Python](<../05-外部资料库/知识库/算法与数据结构/TheAlgorithms/Python/README.md>)：独立实现算法后对照 Python 代码、类型提示与 doctest；同时比较标准库实现，不把教学代码默认用于生产。
- [Data Science for Beginners](<../05-外部资料库/知识库/AI与RAG/microsoft/Data-Science-For-Beginners/README.md>)：通过 Python、Pandas、数据准备与可视化课程及作业，支撑本专项的数据处理项目与评估习惯。
- [AI for Beginners](<../05-外部资料库/知识库/AI与RAG/microsoft/AI-For-Beginners/README.md>)：选择 PyTorch/TensorFlow 可执行 Notebook 和实验，补充 AI 应用、数据处理与框架实践；版本和 API 以当前官方文档为准。

> 使用提示：先独立实现，再对照资料中的思路与答案；语言、工具链和框架版本请回官方文档复核。返回 [[../05-外部资料库/资料索引|资料索引]]。

## 1. 执行模型与边界

- CPython 通常将源码编译为字节码并由解释器执行；PyPy、MicroPython、free-threaded 构建等不能默认共享所有行为。
- Python 是动态强类型语言：运行时才确定许多属性与操作，类型提示主要服务静态检查和工具，不自动验证外部输入。
- 适合自动化、数据、AI、脚本和服务；CPU 密集、实时和打包部署需明确解释器与原生依赖边界。

## 2. 对象、值与可变性

- 变量是名称到对象的绑定，不是固定类型盒子；赋值、参数传递和返回都共享对象引用。
- `is` 与 `==`、浅/深拷贝、可变默认参数、列表/字典/集合的别名。
- 数字精度、Decimal、字符串 Unicode、bytes/bytearray 和文本编码。
- list/tuple/dict/set 的可变性、哈希要求和推导式；不要依赖所有版本的未文档化实现细节。
- 数据类、命名元组、 slots、不可变建模按版本与性能需求选择。
- None、真值测试和空容器，不用隐式真值掩盖 0、空串与 None 的业务差异。

## 3. 函数、对象与协议

- 参数位置/关键字、默认值、*args/**kwargs、闭包和 late binding。
- 迭代器/生成器的惰性、耗尽、关闭和资源清理。
- 装饰器、描述符、dunder 协议用于构建可读抽象，不为炫技隐藏控制流。
- 类、继承、MRO、组合和 dataclass；异常层级与自定义错误保留上下文。
- context manager 的进入/退出与异常处理，连接、文件、锁和事务使用 `with`。

## 4. 类型、错误与模块

- type hints、Protocol、TypedDict、泛型和可选类型；mypy/pyright 与运行时校验各自职责。
- Pydantic/等价工具校验外部输入，类型注解不替代 API 边界。
- import、包、循环依赖、入口脚本与 `if __name__ == '__main__'`。
- venv、pip/uv、锁文件、wheel/sdist、原生库和可复现环境。
- 异常不要裸 `except`；重试要有超时、次数、退避和幂等。

## 5. 并发、进程与异步

- CPython 默认构建的 GIL 对 CPU 密集纯 Python 的影响；I/O、原生扩展和 free-threaded 构建需分别判断。
- threading/multiprocessing/asyncio 的内存、启动、序列化、取消与异常模型不同。
- asyncio event loop、Task/Future、取消、shield、gather 和 backpressure。
- 不在 event loop 中执行长时间阻塞调用；必要时使用受控线程/进程或原生异步库。
- 多进程共享数据、队列、启动方式和平台差异；防止递归创建进程。
- 锁、队列、取消、关闭和任务泄漏需要测试，而非只写 async/await。

## 6. 数据、I/O 与 AI 应用

- 文件 JSON/CSV/二进制、编码、原子写入和大文件流式处理。
- requests/httpx 的超时、重试、连接池和响应关闭。
- NumPy/Pandas 的向量化、视图/副本、dtype 和内存；不把所有操作 Python 循环化。
- FastAPI/Pydantic/SQLAlchemy 的请求生命周期、事务、后台任务和测试。
- RAG/Agent 的结构化输出、工具权限、评估集、成本与 P95 时延；模型输出仍属不可信输入。

## 7. 测试、性能、安全与交付

- pytest fixture、参数化、monkeypatch 和真实依赖集成测试，避免测试之间共享全局状态。
- cProfile、timeit、tracemalloc、py-spy 等定位 CPU/内存；先确定解释器和原生库环境。
- pickle、yaml、模板、子进程、路径和表达式输入的安全边界；避免执行不可信代码。
- 日志脱敏、依赖锁定、API 密钥和最小权限。
- 打包考虑 Python 版本、glibc、动态库、容器与目标平台，不把本机 venv 复制当部署。

## 8. 教学项目与验收

### 最小项目

实现流式 CSV 清洗工具：

- 支持编码错误、坏行、重复、空值、超限和原子输出。
- 生成器控制内存，测试大文件与失败恢复。
- 类型提示、pytest、锁文件和 CLI 退出码齐全。

### 深度实验

- 对同一 I/O 与 CPU 任务比较 threading、multiprocessing 和 asyncio，记录解释器/构建与数据。
- 用 FastAPI 完成一个权限、校验、测试、诊断和部署完整的服务，或带评估的 RAG 应用。

### 通过标准

- [ ] 能解释可变性、闭包、生成器或描述符中的一个真实错误。
- [ ] 能区分类型提示与运行时校验。
- [ ] 能说明 GIL/构建边界及一次并发选择的证据。
- [ ] 服务/工具有失败处理、测试、诊断与可复现环境。
- [ ] AI 应用有评估、权限、成本与失败策略，不以聊天页面代替。

## 9. 常见误区

- 用可变默认参数保存状态，浅拷贝嵌套对象后误以为完全独立。
- 把所有函数标 async，实际仍阻塞事件循环。
- 认为类型提示会让错误输入自动安全。
- 使用 pickle/动态执行处理不可信数据。
- 只看 Python 层耗时，不分析原生扩展、内存和解释器差异。

官方参考：[Python 文档](https://docs.python.org/3/)、[Packaging 指南](https://packaging.python.org/)。解释器、版本、构建模式和原生依赖在实验中注明。
