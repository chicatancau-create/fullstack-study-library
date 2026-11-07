#include "hashmap.h"
#include "alloc.h"
#include "testutil.h"

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

int main(void)
{
    printf("E01 test_hashmap\n");
    test_empty_table();
    test_duplicate_key();
    test_grow_and_lookup();
    test_alloc_failure_on_first_insert();
    test_alloc_failure_during_grow();
    TEST_REPORT("test_hashmap");
}
