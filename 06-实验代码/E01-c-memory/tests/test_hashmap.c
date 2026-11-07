#include "hashmap.h"
#include "alloc.h"
#include "testutil.h"

#include <stdint.h>

static void test_empty_table(void)
{
    HashMap hm;
    int     v = 0;

    CHECK_EQ_INT(hm_init(&hm, 0), HM_OK);
    CHECK_EQ_INT(hm_count(&hm), 0);
    CHECK_EQ_INT(hm_buckets(&hm), 0);

    /* 空表查询必须返回 NOTFOUND，而不是未初始化值。 */
    CHECK_EQ_INT(hm_get(&hm, 123, &v), HM_ENOTFOUND);

    CHECK_EQ_INT(hm_put(&hm, 123, 456, NULL), HM_OK);
    CHECK_EQ_INT(hm_count(&hm), 1);
    CHECK(hm_buckets(&hm) >= 8);
    CHECK_EQ_INT(hm_get(&hm, 123, &v), HM_OK);
    CHECK_EQ_INT(v, 456);
    hm_free(&hm);
}

static void test_duplicate_key(void)
{
    HashMap hm;
    int     v = 0;
    int     replaced = -1;

    CHECK_EQ_INT(hm_init(&hm, 8), HM_OK);
    CHECK_EQ_INT(hm_put(&hm, 42, 1, &replaced), HM_OK);
    CHECK_EQ_INT(replaced, 0);
    CHECK_EQ_INT(hm_count(&hm), 1);

    /* 重复键覆盖：count 不涨，replaced 置 1，旧值被替换。 */
    CHECK_EQ_INT(hm_put(&hm, 42, 2, &replaced), HM_OK);
    CHECK_EQ_INT(replaced, 1);
    CHECK_EQ_INT(hm_count(&hm), 1);
    CHECK_EQ_INT(hm_get(&hm, 42, &v), HM_OK);
    CHECK_EQ_INT(v, 2);

    /* 连续覆盖多次后仍然是 1 个键。 */
    CHECK_EQ_INT(hm_put(&hm, 42, 3, NULL), HM_OK);
    CHECK_EQ_INT(hm_put(&hm, 42, 4, NULL), HM_OK);
    CHECK_EQ_INT(hm_count(&hm), 1);
    CHECK_EQ_INT(hm_get(&hm, 42, &v), HM_OK);
    CHECK_EQ_INT(v, 4);
    hm_free(&hm);
}

static void test_grow_and_lookup(void)
{
    HashMap hm;
    int     i;
    int     v = 0;

    CHECK_EQ_INT(hm_init(&hm, 0), HM_OK);
    for (i = 0; i < 1000; i += 1) {
        CHECK_EQ_INT(hm_put(&hm, i, i * 3, NULL), HM_OK);
    }
    CHECK_EQ_INT(hm_count(&hm), 1000);
    /* 负载因子不超过 3/4，桶数必须跟着涨。 */
    CHECK(hm_buckets(&hm) * 3 >= 1000 * 4);

    for (i = 0; i < 1000; i += 1) {
        CHECK_EQ_INT(hm_get(&hm, i, &v), HM_OK);
        CHECK_EQ_INT(v, i * 3);
    }
    CHECK_EQ_INT(hm_get(&hm, 1000, &v), HM_ENOTFOUND);
    hm_free(&hm);
}

static void test_alloc_failure_on_first_insert(void)
{
    HashMap hm;

    CHECK_EQ_INT(hm_init(&hm, 0), HM_OK);
    fault_alloc_reset();
    fault_alloc_set_fail_at(1); /* 首次插入要建桶数组，让这次 calloc 失败 */

    CHECK_EQ_INT(hm_put(&hm, 1, 1, NULL), HM_ENOMEM);
    CHECK_EQ_INT(hm_count(&hm), 0);
    CHECK_EQ_INT(hm_buckets(&hm), 0);

    /* 恢复后同一插入必须成功，表没有被写成半初始化状态。 */
    fault_alloc_reset();
    CHECK_EQ_INT(hm_put(&hm, 1, 1, NULL), HM_OK);
    CHECK_EQ_INT(hm_count(&hm), 1);
    hm_free(&hm);
}

static void test_alloc_failure_during_grow(void)
{
    HashMap hm;
    int     i;
    int     v = 0;

    CHECK_EQ_INT(hm_init(&hm, 8), HM_OK);
    for (i = 0; i < 6; i += 1) { /* 8 * 3/4 = 6，第 7 个触发扩容 */
        CHECK_EQ_INT(hm_put(&hm, i, i + 100, NULL), HM_OK);
    }
    CHECK_EQ_INT(hm_count(&hm), 6);

    fault_alloc_reset();
    fault_alloc_set_fail_at(1); /* 扩容时 calloc 新桶失败 */
    CHECK_EQ_INT(hm_put(&hm, 77, 777, NULL), HM_ENOMEM);

    /* 扩容失败不得丢数据、不得让旧桶悬空。 */
    CHECK_EQ_INT(hm_count(&hm), 6);
    CHECK_EQ_INT(hm_buckets(&hm), 8);
    for (i = 0; i < 6; i += 1) {
        CHECK_EQ_INT(hm_get(&hm, i, &v), HM_OK);
        CHECK_EQ_INT(v, i + 100);
    }
    CHECK_EQ_INT(hm_get(&hm, 77, &v), HM_ENOTFOUND);

    /* 恢复后扩容 + 插入必须成功。 */
    fault_alloc_reset();
    CHECK_EQ_INT(hm_put(&hm, 77, 777, NULL), HM_OK);
    CHECK_EQ_INT(hm_count(&hm), 7);
    CHECK_EQ_INT(hm_get(&hm, 77, &v), HM_OK);
    CHECK_EQ_INT(v, 777);
    hm_free(&hm);
}

static void test_bucket_cap_contract(void)
{
#if SIZE_MAX > UINT32_MAX
    HashMap hm;

    /* 桶数在 32 位散列域内计算；超过 UINT32_MAX 必须在分配前拒绝。
     * 该边界可在 64 位环境测试，且不会真的申请 32GB。 */
    fault_alloc_reset();
    CHECK_EQ_INT(hm_init(&hm, (size_t)UINT32_MAX + 1), HM_EOVERFLOW);
    CHECK_EQ_INT(hm_count(&hm), 0);
    CHECK_EQ_INT(hm_buckets(&hm), 0);
    CHECK_EQ_INT(fault_alloc_calls(), 0); /* 拒绝发生在分配之前 */
#endif
}

static void test_node_alloc_failure_after_grow(void)
{
    HashMap hm;
    int     i;
    int     v = 0;
    long    live_before;

    CHECK_EQ_INT(hm_init(&hm, 8), HM_OK);
    for (i = 0; i < 6; i += 1) {
        CHECK_EQ_INT(hm_put(&hm, i, i + 100, NULL), HM_OK);
    }
    CHECK_EQ_INT(hm_count(&hm), 6);
    live_before = fault_alloc_live();

    fault_alloc_reset();
    fault_alloc_set_fail_at(2); /* 第 1 次是扩桶 calloc，第 2 次是节点 malloc */
    CHECK_EQ_INT(hm_put(&hm, 77, 777, NULL), HM_ENOMEM);

    /* 扩容成功、节点失败：旧键必须完整，新键不能半插入。 */
    CHECK_EQ_INT(hm_count(&hm), 6);
    CHECK_EQ_INT(hm_buckets(&hm), 16);
    for (i = 0; i < 6; i += 1) {
        CHECK_EQ_INT(hm_get(&hm, i, &v), HM_OK);
        CHECK_EQ_INT(v, i + 100);
    }
    CHECK_EQ_INT(hm_get(&hm, 77, &v), HM_ENOTFOUND);
    CHECK_EQ_INT(fault_alloc_live(), live_before);

    fault_alloc_reset();
    CHECK_EQ_INT(hm_put(&hm, 77, 777, NULL), HM_OK);
    CHECK_EQ_INT(hm_count(&hm), 7);
    CHECK_EQ_INT(hm_get(&hm, 77, &v), HM_OK);
    CHECK_EQ_INT(v, 777);
    hm_free(&hm);
    CHECK_EQ_INT(fault_alloc_live(), 0);
}

static void test_init_failure_and_null_contracts(void)
{
    HashMap hm;
    int     v = 0;

    fault_alloc_reset();
    fault_alloc_set_fail_at(1);
    CHECK_EQ_INT(hm_init(&hm, 8), HM_ENOMEM);
    CHECK_EQ_INT(hm_count(&hm), 0);
    CHECK_EQ_INT(hm_buckets(&hm), 0);

    fault_alloc_reset();
    CHECK_EQ_INT(hm_init(NULL, 8), HM_EINVAL);
    CHECK_EQ_INT(hm_put(NULL, 1, 1, NULL), HM_EINVAL);
    CHECK_EQ_INT(hm_get(NULL, 1, &v), HM_EINVAL);

    CHECK_EQ_INT(hm_init(&hm, 8), HM_OK);
    CHECK_EQ_INT(hm_put(&hm, 1, 1, NULL), HM_OK);
    CHECK_EQ_INT(hm_get(&hm, 1, NULL), HM_EINVAL);
    hm_free(&hm);

    CHECK_EQ_INT(hm_count(NULL), 0);
    CHECK_EQ_INT(hm_buckets(NULL), 0);
    hm_free(NULL); /* 空指针释放必须是 no-op */
}

static void test_alloc_free_balance(void)
{
    HashMap hm;
    int     i;
    long    live_before = fault_alloc_live();

    CHECK_EQ_INT(hm_init(&hm, 0), HM_OK);
    for (i = 0; i < 1000; i += 1) {
        CHECK_EQ_INT(hm_put(&hm, i, i, NULL), HM_OK);
    }
    hm_free(&hm);
    CHECK_EQ_INT(fault_alloc_live(), live_before);
}

int main(void)
{
    printf("E01 test_hashmap\n");
    test_empty_table();
    test_duplicate_key();
    test_grow_and_lookup();
    test_alloc_failure_on_first_insert();
    test_alloc_failure_during_grow();
    test_bucket_cap_contract();
    test_node_alloc_failure_after_grow();
    test_init_failure_and_null_contracts();
    test_alloc_free_balance();
    TEST_REPORT("test_hashmap");
}
