#include "alloc.h"

#include <stdlib.h>

static unsigned long g_calls = 0;
static unsigned long g_fail_at = 0;
static long g_live = 0;

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

long fault_alloc_live(void)
{
    return g_live;
}

static int should_fail(void)
{
    g_calls += 1;
    return (g_fail_at != 0 && g_calls == g_fail_at);
}

void *fault_malloc(size_t size)
{
    void *p;
    if (should_fail()) {
        return NULL;
    }
    p = malloc(size);
    if (p != NULL) {
        g_live += 1;
    }
    return p;
}

void *fault_calloc(size_t count, size_t size)
{
    void *p;
    if (should_fail()) {
        return NULL;
    }
    p = calloc(count, size);
    if (p != NULL) {
        g_live += 1;
    }
    return p;
}

void *fault_realloc(void *ptr, size_t size)
{
    void *p;
    if (should_fail()) {
        return NULL;
    }
    p = realloc(ptr, size);
    if (p != NULL && ptr == NULL) {
        g_live += 1;
    }
    return p;
}

void fault_free(void *ptr)
{
    if (ptr != NULL) {
        g_live -= 1;
    }
    free(ptr);
}
