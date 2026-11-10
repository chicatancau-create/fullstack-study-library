// G1 C 题参考答案：修掉两处缺陷。
// 编译：gcc -std=c11 -O2 -Wall -Wextra -Werror -o rb ring_buffer.c
#include <stddef.h>
#include <stdlib.h>

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
  rb->data = NULL;
  free(rb);
}

int rb_push(rb_t *rb, int value) {
  if (!rb) return -1;
  if (rb->len >= rb->cap) return -2;          // 修复 1：满时拒绝，不越界写
  size_t tail = (rb->head + rb->len) % rb->cap;
  rb->data[tail] = value;
  rb->len += 1;
  return 0;
}

int rb_peek(const rb_t *rb, int index, int *out) {
  if (!rb || !out) return -1;
  if (index < 0) return -1;                    // 修复 2：先挡负数，再做无符号比较
  size_t idx = (size_t)index;
  if (idx >= rb->len) return -1;
  *out = rb->data[(rb->head + idx) % rb->cap];
  return 0;
}

size_t rb_len(const rb_t *rb) { return rb ? rb->len : 0; }
