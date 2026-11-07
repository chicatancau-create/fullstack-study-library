#ifndef HASHMAP_H
#define HASHMAP_H

#include <stddef.h>

typedef enum {
    HM_OK = 0,
    HM_EINVAL = 1,
    HM_ENOMEM = 2,
    HM_EOVERFLOW = 3,
    HM_ENOTFOUND = 4
} HmStatus;

typedef struct HmNode {
    int            key;
    int            value;
    struct HmNode *next;
} HmNode;

typedef struct {
    HmNode **buckets;
    size_t   nbuckets;
    size_t   count;
} HashMap;

/*
 * 契约：
 * - 重复键覆盖旧值，count 不增加，replaced 置 1。
 * - 插入失败（ENOMEM/EOVERFLOW）时表保持原状，已插入的键仍可查。
 * - 负载因子超过 3/4 时桶数翻倍；rehash 只搬节点，不重新分配节点。
 * - hm_get 对不存在的键返回 HM_ENOTFOUND，不返回未初始化值。
 */
HmStatus hm_init(HashMap *hm, size_t initial_buckets);
HmStatus hm_put(HashMap *hm, int key, int value, int *replaced);
HmStatus hm_get(const HashMap *hm, int key, int *out);
size_t   hm_count(const HashMap *hm);
size_t   hm_buckets(const HashMap *hm);
void     hm_free(HashMap *hm);

#endif /* HASHMAP_H */
