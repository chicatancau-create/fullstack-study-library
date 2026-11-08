/* Linux/ASan 专用：分配后不释放，触发 LeakSanitizer。 */
#include <stdlib.h>

int main(void)
{
    void *p = malloc(64);
    if (p == NULL) return 2;
    return 0;
}
