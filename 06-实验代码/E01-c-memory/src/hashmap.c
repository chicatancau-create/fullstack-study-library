#include "hashmap.h"
#include "alloc.h"

#include <stdint.h>
#include <stdlib.h>

#define HM_MIN_BUCKETS ((size_t)8)

static size_t hm_index(int key, size_t nbuckets)
{
    uint32_t h = (uint32_t)key * 2654435761u; /* Knuth 乘法散列，仅用于分散桶 */
    return (size_t)(h % (uint32_t)nbuckets);
}

HmStatus hm_init(HashMap *hm, size_t initial_buckets)
{
    if (hm == NULL) {
        return HM_EINVAL;
    }
    hm->buckets = NULL;
    hm->nbuckets = 0;
    hm->count = 0;
    if (initial_buckets == 0) {
        return HM_OK; /* 容量 0 合法，首次 put 时再分配 */
    }
    if (initial_buckets > SIZE_MAX / sizeof(HmNode *)) {
        return HM_EOVERFLOW;
    }
    hm->buckets = (HmNode **)fault_calloc(initial_buckets, sizeof(HmNode *));
    if (hm->buckets == NULL) {
        return HM_ENOMEM;
    }
    hm->nbuckets = initial_buckets;
    return HM_OK;
}

static HmNode *hm_find_node(const HashMap *hm, int key)
{
    HmNode *cur;

    if (hm->nbuckets == 0) {
        return NULL;
    }
    cur = hm->buckets[hm_index(key, hm->nbuckets)];
    while (cur != NULL) {
        if (cur->key == key) {
            return cur;
        }
        cur = cur->next;
    }
    return NULL;
}

static HmStatus hm_grow(HashMap *hm)
{
    size_t   new_n;
    HmNode **new_buckets;
    size_t   i;

    if (hm->nbuckets == 0) {
        new_n = HM_MIN_BUCKETS;
    } else if (hm->nbuckets > SIZE_MAX / 2) {
        return HM_EOVERFLOW;
    } else {
        new_n = hm->nbuckets * 2;
    }
    if (new_n > SIZE_MAX / sizeof(HmNode *)) {
        return HM_EOVERFLOW;
    }

    new_buckets = (HmNode **)fault_calloc(new_n, sizeof(HmNode *));
    if (new_buckets == NULL) {
        return HM_ENOMEM;
    }

    for (i = 0; i < hm->nbuckets; i += 1) {
        HmNode *cur = hm->buckets[i];
        while (cur != NULL) {
            HmNode *next = cur->next;
            size_t  idx = hm_index(cur->key, new_n);
            cur->next = new_buckets[idx];
            new_buckets[idx] = cur;
            cur = next;
        }
    }
    fault_free(hm->buckets);
    hm->buckets = new_buckets;
    hm->nbuckets = new_n;
    return HM_OK;
}

HmStatus hm_put(HashMap *hm, int key, int value, int *replaced)
{
    HmNode  *existing;
    HmNode  *node;
    HmStatus st;

    if (hm == NULL) {
        return HM_EINVAL;
    }
    if (replaced != NULL) {
        *replaced = 0;
    }

    /* 覆盖路径不分配，避免"更新已有键"因内存不足而失败。 */
    existing = hm_find_node(hm, key);
    if (existing != NULL) {
        existing->value = value;
        if (replaced != NULL) {
            *replaced = 1;
        }
        return HM_OK;
    }

    /* 先保证桶够用，再分配节点；任一步失败都不改变表。 */
    if (hm->nbuckets == 0 || hm->count + 1 > (hm->nbuckets * 3) / 4) {
        st = hm_grow(hm);
        if (st != HM_OK) {
            return st;
        }
    }

    node = (HmNode *)fault_malloc(sizeof *node);
    if (node == NULL) {
        return HM_ENOMEM;
    }
    node->key = key;
    node->value = value;
    node->next = hm->buckets[hm_index(key, hm->nbuckets)];
    hm->buckets[hm_index(key, hm->nbuckets)] = node;
    hm->count += 1;
    return HM_OK;
}

HmStatus hm_get(const HashMap *hm, int key, int *out)
{
    HmNode *node;

    if (hm == NULL || out == NULL) {
        return HM_EINVAL;
    }
    node = hm_find_node(hm, key);
    if (node == NULL) {
        return HM_ENOTFOUND;
    }
    *out = node->value;
    return HM_OK;
}

size_t hm_count(const HashMap *hm)
{
    return (hm == NULL) ? 0 : hm->count;
}

size_t hm_buckets(const HashMap *hm)
{
    return (hm == NULL) ? 0 : hm->nbuckets;
}

void hm_free(HashMap *hm)
{
    size_t i;

    if (hm == NULL) {
        return;
    }
    for (i = 0; i < hm->nbuckets; i += 1) {
        HmNode *cur = hm->buckets[i];
        while (cur != NULL) {
            HmNode *next = cur->next;
            fault_free(cur);
            cur = next;
        }
    }
    fault_free(hm->buckets);
    hm->buckets = NULL;
    hm->nbuckets = 0;
    hm->count = 0;
}
