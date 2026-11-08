/* Linux/ASan 专用：真实 free 后读取，触发 heap-use-after-free。
 * Windows 的守护页替代装置见 fault_uaf.c；两者不互相替代。 */
#include <stdio.h>
#include <stdlib.h>

int main(void)
{
    int *p = malloc(4 * sizeof *p);
    if (p == NULL) return 2;
    p[0] = 42;
    free(p);
    printf("read after free: %d\n", p[0]);
    return 0;
}
