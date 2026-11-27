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
