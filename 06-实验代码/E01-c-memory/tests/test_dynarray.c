#include "dynarray.h"
#include "alloc.h"
#include "testutil.h"

#include <stdint.h>

static void test_capacity_zero(void)
{
    DynArray da;

    CHECK_EQ_INT(da_init(&da, 0), DA_OK);
    CHECK_EQ_INT(da_len(&da), 0);
    CHECK_EQ_INT(da_cap(&da), 0);

    /* 容量 0 时首次 push 必须自行分配，不能写 NULL。 */
    CHECK_EQ_INT(da_push(&da, 7), DA_OK);
    CHECK_EQ_INT(da_len(&da), 1);
    CHECK_EQ_INT(da_cap(&da), 4);

    int v = 0;
    CHECK_EQ_INT(da_get(&da, 0, &v), DA_OK);
    CHECK_EQ_INT(v, 7);
    da_free(&da);
}

static void test_capacity_one(void)
{
    DynArray da;
    int      i;

    CHECK_EQ_INT(da_init(&da, 1), DA_OK);
    CHECK_EQ_INT(da_cap(&da), 1);

    /* 1 -> 2 -> 4 -> 8 的翻倍序列，len 与 cap 不得错位。 */
    for (i = 0; i < 9; i += 1) {
        CHECK_EQ_INT(da_push(&da, i * 10), DA_OK);
        CHECK(da_len(&da) <= da_cap(&da));
    }
    CHECK_EQ_INT(da_len(&da), 9);
    CHECK_EQ_INT(da_cap(&da), 16);

    for (i = 0; i < 9; i += 1) {
        int v = -1;
        CHECK_EQ_INT(da_get(&da, (size_t)i, &v), DA_OK);
        CHECK_EQ_INT(v, i * 10);
    }
    da_free(&da);
}

static void test_index_bounds(void)
{
    DynArray da;
    int      v = 0;

    CHECK_EQ_INT(da_init(&da, 2), DA_OK);
    CHECK_EQ_INT(da_push(&da, 1), DA_OK);

    /* 下标 == len 必须被拒绝，而不是读到未初始化内存。 */
    CHECK_EQ_INT(da_get(&da, 1, &v), DA_ERANGE);
    CHECK_EQ_INT(da_get(&da, 1000, &v), DA_ERANGE);
    CHECK_EQ_INT(da_get(NULL, 0, &v), DA_EINVAL);
    da_free(&da);
}

static void test_alloc_failure_keeps_state(void)
{
    DynArray da;
    int      i;
    int      v = -1;

    CHECK_EQ_INT(da_init(&da, 4), DA_OK);
    for (i = 0; i < 4; i += 1) {
        CHECK_EQ_INT(da_push(&da, i + 1), DA_OK);
    }
    CHECK_EQ_INT(da_len(&da), 4);

    /* 让下一次分配（扩容 realloc）返回 NULL。 */
    fault_alloc_reset();
    fault_alloc_set_fail_at(1);
    CHECK_EQ_INT(da_push(&da, 99), DA_ENOMEM);

    /* 失败后容器必须保持原状：长度不变、旧元素仍可读、没有半写状态。 */
    CHECK_EQ_INT(da_len(&da), 4);
    CHECK_EQ_INT(da_cap(&da), 4);
    CHECK_EQ_INT(da_get(&da, 3, &v), DA_OK);
    CHECK_EQ_INT(v, 4);

    /* 恢复分配后同一操作必须成功，证明失败没有破坏容器。 */
    fault_alloc_reset();
    CHECK_EQ_INT(da_push(&da, 99), DA_OK);
    CHECK_EQ_INT(da_len(&da), 5);
    CHECK_EQ_INT(da_cap(&da), 8);
    CHECK_EQ_INT(da_get(&da, 4, &v), DA_OK);
    CHECK_EQ_INT(v, 99);
    da_free(&da);
}

static void test_overflow_guard(void)
{
    DynArray da;

    /* 用不可能真的分配的容量验证溢出分支先于分配触发。 */
    CHECK_EQ_INT(da_init(&da, SIZE_MAX / sizeof(int) + 1), DA_EOVERFLOW);
    CHECK_EQ_INT(da_len(&da), 0);
    CHECK(da.data == NULL);
}

int main(void)
{
    printf("E01 test_dynarray\n");
    test_capacity_zero();
    test_capacity_one();
    test_index_bounds();
    test_alloc_failure_keeps_state();
    test_overflow_guard();
    TEST_REPORT("test_dynarray");
}
