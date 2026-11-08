/* Linux/UBSan 专用：有符号整数溢出。 */
#include <limits.h>
#include <stdio.h>

int main(void)
{
    volatile int value = INT_MAX;
    value = value + 1;
    printf("value=%d\n", value);
    return 0;
}
