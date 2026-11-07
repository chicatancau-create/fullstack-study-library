#include "alloc.h"

#include <stdlib.h>

static unsigned long g_calls = 0;
static unsigned long g_fail_at = 0;

void fault_alloc_reset(void)
{
    g_calls = 0;
    g_fail_at = 0;
}

void fault_alloc_set_fail_at(unsigned long n)
{
    g_fail_at = n;
}

unsigned long fault_alloc_calls(void)
{
    return g_calls;
}

static int should_fail(void)
{
    g_calls += 1;
    return (g_fail_at != 0 && g_calls == g_fail_at);
}

void *fault_malloc(size_t size)
{
    if (should_fail()) {
        return NULL;
    }
    return malloc(size);
}

void *fault_calloc(size_t count, size_t size)
{
    if (should_fail()) {
        return NULL;
    }
    return calloc(count, size);
}

void *fault_realloc(void *ptr, size_t size)
{
    if (should_fail()) {
        return NULL;
    }
    return realloc(ptr, size);
}

void fault_free(void *ptr)
{
    free(ptr);
}
