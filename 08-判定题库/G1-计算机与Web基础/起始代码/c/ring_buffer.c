// G1 起始代码：有界环形缓冲（含两处真实缺陷，等学习者修）。
// 编译：gcc -std=c11 -O2 -Wall -Wextra -o rb ring_buffer.c
// 测试：见 ../自测脚本/c_probe.c 与 scripts/run_c.sh
//
// 缺陷 1（越界写）：rb_push 在满时没做检查，直接写 tail 位置。
// 缺陷 2（未定义行为）：rb_peek 用 int 下标却用 size_t 比较，负数索引会绕过边界。
#include <stddef.h>
#include <stdlib.h>
#include <string.h>

#include "ring_buffer.h"

rb_t *rb_new(size_t cap) {
  if (cap == 0) return NULL;
  rb_t *rb = (rb_t *)malloc(sizeof(rb_t));
  if (!rb) return NULL;
  rb->data = (int *)calloc(cap, sizeof(int));
  if (!rb->data) {
    free(rb);
    return NULL;
  }
  rb->cap = cap;
  rb->head = 0;
  rb->len = 0;
  return rb;
}

void rb_free(rb_t *rb) {
  if (!rb) return;
  free(rb->data);
  free(rb);
}

int rb_push(rb_t *rb, int value) {
  if (!rb) return -1;
  // 缺陷 1：没有满检查
  size_t tail = (rb->head + rb->len) % rb->cap;
  rb->data[tail] = value;
  rb->len += 1;
  return 0;
}

int rb_peek(const rb_t *rb, int index, int *out) {
  if (!rb || !out) return -1;
  // 缺陷 2：index 是 int，负数被隐式转成很大的 size_t 后比较通过
  if ((size_t)index >= rb->len) return -1;
  *out = rb->data[(rb->head + (size_t)index) % rb->cap];
  return 0;
}

size_t rb_len(const rb_t *rb) { return rb ? rb->len : 0; }
