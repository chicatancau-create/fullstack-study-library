# E01：C 内存、资源与编译 —— 动态数组 + 哈希表

> 对应 [[../../01-阶段课程/专项-核心原理与深度实验|专项：核心原理与深度实验]] 的 E01。
> **本实验只提供 G1 中"内存定位"这一项的证据**，不覆盖 G1 要求的网络解释与键盘操作，因此**不能据此把 G1 标为通过**。
> 记录日期：2026-11-07｜执行环境：Windows + MinGW-w64 GCC 15.2.0 + gdb 17.1

## 1. 这次做了什么、没做什么

做了什么：

- 从零实现动态数组与链地址哈希表（C17，无第三方库）。
- 覆盖容量 0 / 容量 1 / 扩容 / 重复键 / 分配失败五类必测场景。
- 注入一次**越界写**，用 gdb 定位到具体源码行，再以同一份测试源码加边界检查回归通过。
- 做了一组对照：同样的越界写放在普通 `malloc` 堆上**不会崩溃**，证明"没崩"不能当安全证据。

没做什么（避免夸大）：

- 没有做释放后使用（UAF）、双重释放、泄漏检测的注入——本机工具链做不到（见第 8 节）。
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
ASan      : 不可用（`-fsanitize=address` 链接报 cannot find -lasan）
```

"干净"的含义：`rm -rf build && bash scripts/build.sh` 从零重建，不依赖任何既有产物；构建零告警。环境原始输出见 `evidence/env.txt`。

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
bash scripts/build.sh        # 编译 5 个产物到 build/
bash scripts/run_tests.sh    # 采全部证据到 evidence/
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
| `test_hashmap` | 全部通过 | `checks=3061 fails=0 : PASS`，exit 0 | 符合 |
| 构建 | 零告警 | 零告警（`-Wall -Wextra -Wpedantic`） | 符合 |
| 对照组（普通堆越界） | 不崩溃、静默写坏堆 | `no crash observed; read back arr[4] = 123`，exit 0 | 符合（正是危险点） |
| 注入版（守护页越界） | 立即访问冲突 | `SIGSEGV`，exit 139 | 符合 |
| 修复版 | 拒绝越界不触碰守护页 | `rejected: index 4 out of range (len=4)`，exit 0 | 符合 |

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

本机没有 ASan / Valgrind，替代方案是守护页 + gdb。因此：

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
| G1 | **仅"内存定位"一项** | G1 = 网络解释 + 键盘操作 + 内存定位。本实验只提供第三项，另两项分别由 E04 与 E05 覆盖 |

结论：**E01 完成 ≠ G1 通过**。G1 的判定要等 E04（网络）与 E05（键盘/可访问性）也有证据后，在评估文档里单独更新。

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
│   └── fault_plain.c            对照组：普通堆越界不崩
├── scripts/
│   ├── build.sh                 5 个构建目标
│   └── run_tests.sh             采集 evidence/ 下全部证据
├── evidence/                    真实运行输出，提交入库
└── build/                       构建产物，已被 .gitignore 排除
```

## 12. 复现与判读

```bash
rm -rf build && bash scripts/run_tests.sh && grep -h 'PASS\|FAIL' evidence/test_run.txt
```

判读顺序：先看 `evidence/test_run.txt` 是否两项 PASS，再看 `evidence/fault_inject.txt` 的 SIGSEGV 行号是否落在越界写那一行，最后看 `evidence/fault_fixed.txt` 的 exit 是否为 0。三步都对，才说明"复现—定位—回归"闭环成立；任何一步缺失都不算通过。
