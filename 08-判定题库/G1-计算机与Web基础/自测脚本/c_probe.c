// G1 C 题自测探针（由参考答案编译）：把越界与负索引两种情况都跑一遍。
// 由 scripts/run_c.sh 编译，返回码即判据：
//   0 = 全部按契约返回（满时返回 -2，负索引返回 -1）
//   2 = 满时越界写（len 超过 cap）
//   3 = 负索引读到垃圾数据
#include <stdio.h>
#include <stdlib.h>

#include "ring_buffer.h"

int main(void) {
  // 1) 满时拒绝：容量 3，推 4 次，第 4 次必须返回 -2，且 len 冻结在 3
  rb_t *rb = rb_new(3);
  if (!rb) return 4;
  for (int i = 0; i < 3; i += 1) {
    if (rb_push(rb, i * 10) != 0) return 5;
  }
  int rc = rb_push(rb, 999);
  if (rc != -2) {
    printf("full-push rc=%d len=%zu\n", rc, rb_len(rb));
    return 2;
  }
  if (rb_len(rb) != 3) return 2;

  // 2) 正常读取
  int v = -1;
  if (rb_peek(rb, 0, &v) != 0 || v != 0) return 6;
  if (rb_peek(rb, 2, &v) != 0 || v != 20) return 6;

  // 3) 负索引必须被拒（且不得读内存）
  if (rb_peek(rb, -1, &v) != -1) {
    printf("negative-index returned 0, out=%d\n", v);
    return 3;
  }
  if (rb_peek(rb, 3, &v) != -1) return 3;

  // 4) 边界参数
  if (rb_new(0) != NULL) return 7;
  rb_free(rb);
  rb_free(NULL);
  printf("c-probe ok\n");
  return 0;
}
