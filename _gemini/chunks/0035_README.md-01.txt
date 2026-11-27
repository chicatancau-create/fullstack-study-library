# E01：C 内存、资源与编译 —— 动态数组 + 哈希表

> 对应 [[../../01-阶段课程/专项-核心原理与深度实验|专项：核心原理与深度实验]] 的 E01。
> **本实验只提供 G1 中"内存定位"这一项的证据**，不覆盖 G1 要求的网络解释与键盘操作，因此**不能据此把 G1 标为通过**。
> 记录日期：2026-11-07｜执行环境：Windows + MinGW-w64 GCC 15.2.0 + gdb 17.1

## 1. 这次做了什么、没做什么

做了什么：

- 从零实现动态数组与链地址哈希表（C17，无第三方库）。
- 覆盖容量 0 / 容量 1 / 扩容 / 重复键 / 分配失败五类必测场景。
- 注入一次**越界写**，用 gdb 定位到具体源码行，再以同一份测试源码加边界检查回归通过。
- 批次 1：补充桶数上限契约（`UINT32_MAX`，分配前拒绝）、节点分配失败、初始化失败与空输出参数、分配/释放平衡；新增 UAF 平台替代装置；`run_tests.sh` 改为失败非零，并精确断言 SIGSEGV 退出码与源码行。
- 做了一组对照：同样的越界写放在普通 `malloc` 堆上**不会崩溃**，证明"没崩"不能当安全证据。

没做什么（避免夸大）：

- Windows 本机工具链没有 ASan；UAF、泄漏、UBSan 与 Valgrind 改由 Linux CI 完成（`scripts/asan_linux.sh`），双重释放未单列。
- 没有做并发/多线程用例：E01 是单线程数据结构实验。
- 没有接入 CI，没有跨平台（Linux/clang）复测。
- 没有把动态数组/哈希表接进任何业务项目，仍是独立实验件。

## 2. 假设（可证伪）

| # | 假设 | 判定方式 | 实际结果 |
| --- | --- | --- | --- |
| H1 | 容量为 0 的容器若在首次插入时直接写 `data[0]`，会写 NULL 指针并崩溃 | 用 `da_init(0)` 后立刻 `push`，看是否分配 | **实现已在 `da_grow` 处理 `cap == 0`**，push 成功、cap 变 4，崩溃未发生（假设的缺陷不在本实现里） |
| H2 | 扩容时若"先 `free` 再 `malloc`"，分配失败会导致旧数据丢失或二次释放 | 用可注入失败的分配器让扩容返回 NULL，检查旧元素与句柄 | 实现用的是 `realloc`，失败时原指针仍有效；实测旧 4 个元素可读、len/cap 不变（H2 的风险在正确写法下不成立） |
| H3 | 同样的越界写，普通堆不会报错，只有守护页/Sanitizer 才会暴露 | 同一段越界代码分别跑普通堆与守护页 | **成立**：普通堆 `exit=0` 且读回 123；守护页 `SIGSEGV`（见第 6、7 节） |
| H4 | 桶数组扩容失败时若不先建新桶就改状态，会把旧桶写坏 | 在扩容的 `calloc` 上注入失败，检查 count、桶数与全部旧键 | 实现是"先建新桶、成功后再替换"，实测 count 仍 6、8 个桶、6 个键全部可查 |

## 3. 干净环境

```text
OS        : Windows（MinGW-w64 UCRT 运行时）
compiler  : gcc.exe (MinGW-W64 x86_64-ucrt-posix-seh, built by Brecht Sanders, r7) 15.2.0
debugger  : GNU gdb (GDB for MinGW-W64 x86_64) 17.1
flags     : -std=c17 -Wall -Wextra -Wpedantic -g -O0
make      : 不可用（脚本用 gcc 直接构建）
clang     : 不可用
valgrind  : 不可用
MSVC cl   : 不可用
ASan/UBSan/Valgrind : Windows 本机不可用；Linux CI 可用，见 `evidence/asan_linux.txt`
```

"干净"的含义：`rm -rf build && bash scripts/build.sh` 从零重建，不依赖任何既有产物；构建零告警。环境原始输出见 `evidence/env.txt`。

ASan 一栏不是人工结论：`run_tests.sh` 会真实执行 `gcc -print-file-name=libasan.dll`，并编译链接一个 `malloc(4*sizeof(int))` 后写 `p[4]` 的最小程序，把命令、stdout/stderr 与退出码原样写入 `evidence/env.txt`。本机实测链接阶段退出码 1（`cannot find -lasan`），因此判为不可用；若该库将来可用，脚本会继续实际运行探针程序，只有当输出含 `heap-buffer-overflow` 时才记 `ASan: AVAILABLE`，并同时记录运行结果。

## 4. 输入

不是外部数据，而是用例矩阵 + 可控的失败注入点：

| 类别 | 输入 | 覆盖点 |
| --- | --- | --- |
| 容量边界 | `da_init(0)`、`da_init(1)`、`da_init(SIZE_MAX/sizeof(int)+1)` | 首次分配、翻倍序列 1→2→4→8→16、溢出分支先于分配触发 |
| 下标边界 | `da_get(len)`、`da_get(1000)`、`da_get(NULL,…)` | 越界必须返回 `DA_ERANGE`，不读野指针 |
| 重复键 | `hm_put(42,1..4)` 连续四次 | 覆盖语义：count 恒为 1、`replaced` 置 1、值取最后一次 |
| 规模 | 连续插入 1000 个键 | 负载因子 ≤ 3/4、扩容后全部键可查 |
| 分配失败 | `fault_alloc_set_fail_at(1)` 分别打在首次插入、扩容、以及动态数组扩容上 | 失败后表/数组保持原状，恢复后同一操作成功 |

## 5. 执行命令

```bash
cd 06-实验代码/E01-c-memory
bash scripts/build.sh        # 编译 7 个产物到 build/
bash scripts/run_tests.sh    # 采全部证据到 evidence/，任一必需步骤失败即非零
bash scripts/selftest_gate.sh # 主动破坏一次，确认门禁真的会变红
node ../_template/manifest.mjs verify evidence/manifest.json  # 证据文件存在且 SHA-256 一致
```

单独跑某一项：

```bash
./build/test_dynarray.exe           # 单元用例
./build/test_hashmap.exe            # 单元用例
./build/fault_plain.exe             # 对照组：普通堆越界，不崩
./build/fault_guard.exe             # 注入版：守护页越界，SIGSEGV
./build/fault_guard_fixed.exe       # 修复版：拒绝越界，exit 0
```

## 6. 预期观察 vs 实际结果

| 项 | 预期 | 实际 | 判定 |
| --- | --- | --- | --- |
| `test_dynarray` | 全部通过 | `checks=72 fails=0 : PASS`，exit 0 | 符合 |
| `test_hashmap` | 全部通过 | `checks=4108 fails=0 : PASS`，exit 0 | 符合 |
| 构建 | 零告警 | 零告警（`-Wall -Wextra -Wpedantic`） | 符合 |
| 对照组（普通堆越界） | 不崩溃、静默写坏堆 | `no crash observed; read back arr[4] = 123`，exit 0 | 符合（正是危险点） |
| 注入版（守护页越界） | 立即访问冲突 | `SIGSEGV`，exit 139 | 符合 |
| 修复版 | 拒绝越界不触碰守护页 | `rejected: index 4 out of range (len=4)`，exit 0 | 符合 |
| UAF 注入（`PAGE_NOACCESS` 模拟释放） | 读取已标记不可访问的页立即崩溃 | `SIGSEGV`，exit 139，定位 `tests/fault_uaf.c:37` | 符合 |
| UAF 修复版 | 不读取，进程正常退出 | `skipped read after simulated free`，exit 0 | 符合 |
| 门禁自检 | 破坏重复键语义后门禁非零 | `test_hashmap ... fails=1 : FAIL`，门禁 exit 1 | 符合 |

## 7. 失败注入：一次越界写与调试器定位

