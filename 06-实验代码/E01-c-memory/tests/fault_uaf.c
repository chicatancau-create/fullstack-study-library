/* E01 失败注入夹具：模拟 free 后访问（UAF）。
 *
 * 这不是产品源码的回归测试，而是"本机没有 ASan 时如何把 UAF 变成可定位崩溃"
 * 的平台替代装置：分配一页可读写内存，写入后把整页改成 PAGE_NOACCESS，
 * 模拟"释放后不可再访问"。注入版读取该页 -> SIGSEGV；修复版不读取 -> exit 0。
 *
 * 边界：只覆盖 Windows VirtualAlloc/VirtualProtect；Linux 需 mmap/mprotect，
 * 本轮未验证。它不能发现"仍然映射但已逻辑释放"的 UAF，也不能替代 ASan。
 */
#include <windows.h>

#include <stdio.h>

int main(void)
{
    int  *p;
    DWORD old_protect = 0;

    p = (int *)VirtualAlloc(NULL, 4096, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
    if (p == NULL) {
        fprintf(stderr, "VirtualAlloc failed: %lu\n", (unsigned long)GetLastError());
        return 2;
    }
    *p = 42;

    if (!VirtualProtect(p, 4096, PAGE_NOACCESS, &old_protect)) {
        fprintf(stderr, "VirtualProtect failed: %lu\n", (unsigned long)GetLastError());
        VirtualFree(p, 0, MEM_RELEASE);
        return 3;
    }
    fprintf(stderr, "simulated free: page is now PAGE_NOACCESS\n");
    fflush(stderr);

#ifdef UAF_ACCESS
    fprintf(stderr, "reading p[0] after simulated free (use-after-free)\n");
    fflush(stderr);
    printf("unexpected read: %d\n", p[0]);
#else
    printf("skipped read after simulated free; guard page left untouched\n");
#endif

    VirtualFree(p, 0, MEM_RELEASE);
    return 0;
}