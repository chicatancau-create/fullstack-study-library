#include "dynarray.h"
#include "alloc.h"

#include <stdint.h>
#include <stdlib.h>

#define DA_MIN_CAP ((size_t)4)

DaStatus da_init(DynArray *da, size_t initial_cap)
{
    if (da == NULL) {
        return DA_EINVAL;
    }
    da->data = NULL;
    da->len = 0;
    da->cap = 0;
    if (initial_cap == 0) {
        return DA_OK; /* 容量 0 是合法状态，首次 push 时才分配 */
    }
    if (initial_cap > SIZE_MAX / sizeof(int)) {
        return DA_EOVERFLOW;
    }
    da->data = (int *)fault_malloc(initial_cap * sizeof(int));
    if (da->data == NULL) {
        return DA_ENOMEM;
    }
    da->cap = initial_cap;
    return DA_OK;
}

static DaStatus da_grow(DynArray *da)
{
    size_t new_cap;
    int   *grown;

    if (da->cap == 0) {
        new_cap = DA_MIN_CAP;
    } else if (da->cap > SIZE_MAX / 2) {
        return DA_EOVERFLOW;
    } else {
        new_cap = da->cap * 2;
    }
    if (new_cap > SIZE_MAX / sizeof(int)) {
        return DA_EOVERFLOW;
    }

    /* realloc 失败时原指针仍然有效，因此不需要回滚，也不能先 free。 */
    grown = (int *)fault_realloc(da->data, new_cap * sizeof(int));
    if (grown == NULL) {
        return DA_ENOMEM;
    }
    da->data = grown;
    da->cap = new_cap;
    return DA_OK;
}

DaStatus da_push(DynArray *da, int value)
{
    DaStatus st;

    if (da == NULL) {
        return DA_EINVAL;
    }
    if (da->len == da->cap) {
        st = da_grow(da);
        if (st != DA_OK) {
            return st;
        }
    }
    da->data[da->len] = value;
    da->len += 1;
    return DA_OK;
}

DaStatus da_get(const DynArray *da, size_t index, int *out)
{
    if (da == NULL || out == NULL) {
        return DA_EINVAL;
    }
    if (index >= da->len) {
        return DA_ERANGE;
    }
    *out = da->data[index];
    return DA_OK;
}

size_t da_len(const DynArray *da)
{
    return (da == NULL) ? 0 : da->len;
}

size_t da_cap(const DynArray *da)
{
    return (da == NULL) ? 0 : da->cap;
}

void da_free(DynArray *da)
{
    if (da == NULL) {
        return;
    }
    fault_free(da->data);
    da->data = NULL;
    da->len = 0;
    da->cap = 0;
}
