#ifndef DYNARRAY_H
#define DYNARRAY_H

#include <stddef.h>

typedef enum {
    DA_OK = 0,
    DA_EINVAL = 1,   /* 参数非法，例如 NULL 句柄 */
    DA_ENOMEM = 2,   /* 分配失败；调用后容器保持原状，不丢数据 */
    DA_EOVERFLOW = 3,/* 容量翻倍会溢出 size_t */
    DA_ERANGE = 4    /* 下标越界 */
} DaStatus;

typedef struct {
    int   *data;
    size_t len;
    size_t cap;
} DynArray;

/*
 * 契约：
 * - 任何失败都不得改变 len、cap 和已有元素；ENOMEM 时容器仍可直接 free。
 * - da_get 的下标必须 < len，越界返回 DA_ERANGE 而不是读野指针。
 * - 容量增长按 0 -> 4、其后翻倍；溢出返回 DA_EOVERFLOW。
 */
DaStatus da_init(DynArray *da, size_t initial_cap);
DaStatus da_push(DynArray *da, int value);
DaStatus da_get(const DynArray *da, size_t index, int *out);
size_t   da_len(const DynArray *da);
size_t   da_cap(const DynArray *da);
void     da_free(DynArray *da);

#endif /* DYNARRAY_H */
