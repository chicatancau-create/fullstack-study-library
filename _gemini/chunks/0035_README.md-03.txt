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

- Windows 的 ASan/UBSan/LSan/Valgrind 仍不可用；Linux CI 已覆盖 ASan/LSan（UAF+泄漏）、UBSan（溢出）与 Valgrind（泄漏）。
- 未做跨平台（Linux/clang）复测。
- 未做并发数据结构测试；E01 仍是单线程。
- 未把数据结构接进业务项目。
- 本批不改变 G1 状态：G1 仍是“待评估”，E01 只提供内存定位一项。
