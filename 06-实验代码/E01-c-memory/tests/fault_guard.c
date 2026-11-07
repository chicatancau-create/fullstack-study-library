/*
 * 越界写注入装置（Windows / MinGW）。
 *
 * 为什么不用 ASan：本机 MinGW-w64 GCC 15.2.0 没有 libasan
 * （链接报 "cannot find -lasan"，见 evidence/env.txt）。因此改用
 * VirtualAlloc 在缓冲区末尾紧贴一个 PAGE_NOACCESS 守护页：
 * 越界写会立刻触发访问冲突，由调试器（gdb）停在出错的源码行。
 *
 * 装置与 src/dynarray.c 的 da_push 同构：写入前只判断 "len == cap 才扩容"，
 * 不检查 index。这样它演示的是同一类缺陷，而不是另写的假代码。
 *
 * 两种编译：
 *   gcc -DGUARD_PAGE          → 注入版：越界写 → 访问冲突 → gdb 定位
 *   gcc -DGUARD_PAGE -DFIXED_BOUNDS → 修复版：先判 index >= len 并拒绝
 */

#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include <stdio.h>

int main(void)
{
    const size_t  len = 4;
    const size_t  bytes = len * sizeof(int);
    SYSTEM_INFO   si;
    size_t        page;
    size_t        data_pages;
    size_t        total;
    char         *base;
    DWORD         old_protect = 0;
    int          *arr;
    size_t        i;
    const size_t  idx = len; /* 第一个越界下标 */

    GetSystemInfo(&si);
    page = (size_t)si.dwPageSize;
    data_pages = (bytes + page - 1) / page;
    total = (data_pages + 1) * page; /* 数据页 + 1 个守护页 */

    base = (char *)VirtualAlloc(NULL, total, MEM_RESERVE | MEM_COMMIT,
                               PAGE_READWRITE);
    if (base == NULL) {
        fprintf(stderr, "VirtualAlloc failed: %lu\n",
                (unsigned long)GetLastError());
        return 2;
    }
    if (!VirtualProtect(base + data_pages * page, page, PAGE_NOACCESS,
                        &old_protect)) {
        fprintf(stderr, "VirtualProtect failed: %lu\n",
                (unsigned long)GetLastError());
        VirtualFree(base, 0, MEM_RELEASE);
        return 2;
    }

    /* 让数组末尾正好贴住守护页起点，越界 1 个元素就踩进守护页。 */
    arr = (int *)(base + data_pages * page - bytes);
    for (i = 0; i < len; i += 1) {
        arr[i] = (int)i;
    }

#ifdef FIXED_BOUNDS
    if (idx >= len) {
        fprintf(stderr,
                "rejected: index %zu out of range (len=%zu); guard page left "
                "untouched\n",
                idx, len);
        VirtualFree(base, 0, MEM_RELEASE);
        return 0;
    }
#endif

    fprintf(stderr, "writing arr[%zu] = 123  (%zu bytes past the last element)\n",
            idx, sizeof(int));
    fflush(stderr);

    /* volatile 保证这次写不会被优化掉。 */
    ((volatile int *)arr)[idx] = 123;

    fprintf(stderr, "unexpected: write completed without fault\n");
    VirtualFree(base, 0, MEM_RELEASE);
    return 1;
}
