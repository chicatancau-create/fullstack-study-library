/*
 * 对照组：同样的越界写，放在普通 malloc 堆上会发生什么。
 *
 * 结论预期是"什么都不发生"——程序正常退出，越界的那 4 字节被静默写进堆里。
 * 这个用例存在的意义，是证明"没有崩溃"不能当作内存安全的证据：
 * 只有换到守护页（fault_guard.c）或 Sanitizer 才会暴露同一处缺陷。
 */

#include <stdio.h>
#include <stdlib.h>

int main(void)
{
    const size_t len = 4;
    int         *arr;
    size_t       i;

    arr = (int *)malloc(len * sizeof(int));
    if (arr == NULL) {
        fprintf(stderr, "malloc failed\n");
        return 2;
    }
    for (i = 0; i < len; i += 1) {
        arr[i] = (int)i;
    }

    printf("writing arr[%zu] on ordinary heap (len=%zu) ...\n", len, len);
    fflush(stdout);

    ((volatile int *)arr)[len] = 123; /* 越界 1 个元素 */

    printf("no crash observed; read back arr[%zu] = %d\n", len,
           ((volatile int *)arr)[len]);
    printf("=> plain heap does not detect overflow: this run looked fine, "
           "but the heap was corrupted\n");
    free(arr);
    return 0;
}
