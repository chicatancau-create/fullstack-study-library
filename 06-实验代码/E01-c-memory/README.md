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

- Windows 本机工具链没有 ASan；UAF 与泄漏检测改由 Linux/ASan CI 完成（`scripts/asan_linux.sh`），双重释放未单列。
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
ASan      : Windows 本机不可用（MinGW 无 libasan）；Linux CI 可用，见 `evidence/asan_linux.txt`
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

装置：`tests/fault_guard.c`。它和 `src/dynarray.c` 的 `da_push` 同构——写入前只判断 `len == cap 才扩容`，不检查下标。缓冲区用 `VirtualAlloc` 分配，末尾紧贴一个 `PAGE_NOACCESS` 守护页，所以越界 1 个 `int` 就落进守护页。

关键证据（`evidence/fault_inject.txt`）：

```text
writing arr[4] = 123  (4 bytes past the last element)
Thread 1 received signal SIGSEGV, Segmentation fault.
main () at tests/fault_guard.c:78
78      ((volatile int *)arr)[idx] = 123;

--- backtrace ---
#0  main () at tests/fault_guard.c:78

--- locals ---
len = 4      page = 4096      base = 0x1b0000
arr = 0x1b0ff0      idx = 4
```

地址自洽：`base + page = 0x1b0000 + 0x1000 = 0x1b1000`，而 `arr + 4*4 = 0x1b0ff0 + 0x10 = 0x1b1000`——越界地址正好是守护页首字节。这是"失败证据指向具体位置"，不是"程序挂了所以大概有 bug"。

## 8. 修复与同一测试回归

修复方式：写入前判断 `idx >= len` 并拒绝，对应 `src/dynarray.c` 里 `da_get` 已有的 `DA_ERANGE` 契约。

同一份源码、同一条测试路径，只加 `-DFIXED_BOUNDS` 重编：

```text
rejected: index 4 out of range (len=4); guard page left untouched
exit=0
```

`evidence/fault_fixed.txt` 与 `evidence/fault_inject.txt` 是同一装置的两个编译版本，可直接比对。

## 9. 边界：这套工具**没有**证明什么

Windows 本机没有 ASan / Valgrind（由 `scripts/run_tests.sh` 实跑探测确认，非人工断言），替代方案是守护页 + gdb；Linux CI 另有 ASan/LSan。因此：

1. **只覆盖向后越界**（写到缓冲区末尾之后）。向前越界（负下标）不会踩到守护页，本装置检测不到。
2. **不检测释放后使用**（UAF）：`free` 后内存仍在进程堆里，读写通常不触发异常；若要把 UAF 变成崩溃，需要自定义分配器把页改成 `PAGE_NOACCESS`，这属于额外装置，本实验未做。
3. **不检测未初始化读**：`da_get` 的越界由返回值挡住，但"读已分配未写入区域"这类问题本装置无感知。
4. **不检测内存泄漏**：进程退出即回收，泄漏需要计数或工具。
5. **不检测并发问题**：无数据竞争检测，实验本身单线程。
6. **不覆盖跨平台行为**：`VirtualAlloc` 是 Windows API；同样的实验在 Linux 上要用 `mmap` + `mprotect`，本轮未验证。
7. **gdb 行号依赖 `-g -O0`**：开优化后行号可能漂移，不能拿优化版的栈帧当同一证据。

所以本实验**不声称"内存安全"**，只声称："在给定装置下，这一类越界写被稳定复现、被定位到具体行、并且修复后可回归。"

## 10. M / G 映射

| 项 | 映射 | 说明 |
| --- | --- | --- |
| M01 编程与算法 | 部分 | 不变量（`len <= cap`）、边界、`size_t` 溢出、资源归属：`da_push`/`hm_put` 的失败不改变状态 |
| M02 系统与网络 | 部分 | 栈/堆布局、页保护、访问冲突与调试器定位；网络部分不在 E01 |
| G1 | **仅"内存定位"一项** | G1 = 网络解释 + 键盘操作 + 内存定位。本实验只提供第三项；网络由 [E04](../E04-http-network/README.md) 覆盖，键盘/可访问性由 [G1 响应式站点](../G1-responsive-site/README.md) 覆盖。E05 属于 G3/G6 的构建与渲染模式，不承担 G1 键盘项 |

结论：**E01 完成 ≠ G1 通过**。G1 的判定要等 E04（网络）与 G1 响应式站点（键盘/可访问性）也有证据后，在评估文档里单独更新。

## 11. 目录结构

```text
E01-c-memory/
├── src/
│   ├── alloc.h / alloc.c        可注入失败的分配器（第 n 次分配返回 NULL）
│   ├── dynarray.h / dynarray.c  动态数组
│   └── hashmap.h / hashmap.c    链地址哈希表
├── tests/
│   ├── testutil.h               断言与计数宏
│   ├── test_dynarray.c          容量 0/1、扩容、越界、分配失败、溢出
│   ├── test_hashmap.c           空表、重复键、1000 键扩容、首次插入失败、扩容失败
│   ├── fault_guard.c            越界注入装置（守护页），含修复分支
│   ├── fault_plain.c            对照组：普通堆越界不崩
│   └── fault_uaf.c              UAF 平台替代：PAGE_NOACCESS 模拟释放
├── scripts/
│   ├── build.sh                 7 个构建目标
│   ├── run_tests.sh             采集证据并做非零门禁
│   └── selftest_gate.sh         主动破坏，确认门禁会红
├── evidence/                    真实运行输出，提交入库
└── build/                       构建产物，已被 .gitignore 排除
```

## 12. 复现与判读

```bash
rm -rf build && bash scripts/run_tests.sh; echo "gate_rc=$?"
bash scripts/selftest_gate.sh; echo "selftest_rc=$?"
grep -h 'PASS\|FAIL' evidence/test_run.txt
```

判读顺序：先看 `evidence/test_run.txt` 是否 `test_dynarray=72`、`test_hashmap=4108` 且两项 PASS，再看 `evidence/fault_inject.txt` 的 SIGSEGV 行号是否等于 `tests/fault_guard.c` 中越界写的实际行号，再看 `evidence/fault_uaf.txt` 是否定位到 `tests/fault_uaf.c` 的读取行，最后看 `evidence/gate_selftest.txt` 是否记录“破坏后 gate_exit=1”。`run_tests.sh` 自身退出码必须为 0；任何一步缺失都不算通过。

## 13. 批次 1 修复与门禁（2026-11-07）

### 13.1 桶数截断/模零

原实现把 `size_t nbuckets` 强转成 `uint32_t` 再取模：桶数超过 `UINT32_MAX` 时既可能截断到错误下标，也可能截成 0 触发模零。修复采用**限制契约**：

- `HM_MAX_BUCKETS = UINT32_MAX`；`hm_init` 在发起分配前拒绝更大的初值，返回 `HM_EOVERFLOW`。
- `hm_grow` 在翻倍会超过上限时返回 `HM_EOVERFLOW`，不会走到不可完成的分配。
- `hm_index` 对 0 桶防御性返回 0，调用方仍先用 `hm_find_node`/`hm_grow` 排除 0 桶。

可测边界：64 位环境下 `hm_init(&hm, (size_t)UINT32_MAX + 1)` 必须返回 `HM_EOVERFLOW` 且 `fault_alloc_calls()==0`。修复前实测返回 `HM_ENOMEM` 且发起了一次分配；修复后通过。该测试不申请 32GB，只验证“分配前拒绝”。

### 13.2 其余边界

- 建桶成功、节点分配失败：旧 6 个键完整、`count` 不变、桶数已扩到 16、新键不存在、live 计数回到失败前。
- 初始化失败：`hm_init` 的 `calloc` 失败返回 `HM_ENOMEM`，字段保持 0。
- 空输出参数：`hm_get(hm, key, NULL)` 与空表/空指针契约。
- 分配/释放平衡：1000 次插入后 `hm_free`，`fault_alloc_live()` 回到插入前。
- 重复键覆盖、扩容失败、容量边界等原有用例保留。

### 13.3 UAF 平台替代

`tests/fault_uaf.c` 用 `VirtualAlloc` 分配一页，写入后 `VirtualProtect(PAGE_NOACCESS)` 模拟“释放后不可访问”，再读取。注入版在 `tests/fault_uaf.c:37` 触发 SIGSEGV（exit 139），修复版不读取、exit 0。它证明的是“这一类页级 UAF 能被变成可定位崩溃”，**不是**通用 UAF 检测：

- 只覆盖 Windows `VirtualAlloc/VirtualProtect`；Linux 需 `mmap/mprotect`，未验证。
- 只覆盖整页被标记不可访问的情况；仍映射但逻辑已释放的 UAF 检测不到。
- 不能替代 ASan/LSan；Windows 本机 ASan 仍不可用（`evidence/env.txt`），Linux CI 的 ASan/LSan 见 `evidence/asan_linux.txt`。

### 13.4 门禁

`run_tests.sh` 现在要求：

1. 构建退出 0，7 个产物齐全；
2. 两个测试文件都有 `fails=0` 与 `PASS`；
3. 越界注入 exit 139、含 `SIGSEGV`、行号等于源码实际行；
4. 修复版输出 `rejected:` 且 exit 0；
5. UAF 注入 exit 139、定位行正确；UAF 修复版 exit 0；
6. 所有 evidence 文件非空；
7. 任一失败最终 exit 1。

`scripts/selftest_gate.sh` 在临时副本里把重复键的 `replaced=1` 改成 0，门禁实测 exit 1，并把 `test_hashmap ... fails=1 : FAIL` 写入 `evidence/gate_selftest.txt`。这证明门禁不是“只打印不拦截”。

### 13.5 仍未覆盖

- Windows 的 ASan/UBSan/LSan/Valgrind 仍不可用；Linux CI 已覆盖 ASan/LSan（UAF+泄漏），UBSan/Valgrind 未做。
- 未做跨平台（Linux/clang）复测。
- 未做并发数据结构测试；E01 仍是单线程。
- 未把数据结构接进业务项目。
- 本批不改变 G1 状态：G1 仍是“待评估”，E01 只提供内存定位一项。
