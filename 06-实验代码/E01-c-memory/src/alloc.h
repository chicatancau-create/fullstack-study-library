#ifndef ALLOC_H
#define ALLOC_H

#include <stddef.h>

/*
 * 可注入失败的分配器。
 *
 * 目的：在没有 ASan/Valgrind 的环境里，仍然能可重复地测试"分配返回 NULL"这条
 * 分支。做法是给每一次分配编号，调用 fault_alloc_set_fail_at(n) 后第 n 次
 * 分配返回 NULL，其余照常转到 malloc。
 *
 * 边界：它只模拟"malloc 返回 NULL"，不模拟碎片化、不模拟 overcommit、也不检查
 * 内存越界。越界与 UAF 由 tests/fault_guard.c 的 guard page 用例负责。
 */

void  fault_alloc_reset(void);
/* n 从 1 开始计数；n == 0 表示关闭注入。 */
void  fault_alloc_set_fail_at(unsigned long n);
unsigned long fault_alloc_calls(void);

void *fault_malloc(size_t size);
void *fault_calloc(size_t count, size_t size);
void *fault_realloc(void *ptr, size_t size);
void  fault_free(void *ptr);

#endif /* ALLOC_H */
