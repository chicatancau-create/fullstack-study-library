#ifndef RING_BUFFER_H
#define RING_BUFFER_H

#include <stddef.h>

typedef struct rb_t {
  int *data;
  size_t cap;
  size_t head;
  size_t len;
} rb_t;

rb_t *rb_new(size_t cap);
void rb_free(rb_t *rb);
int rb_push(rb_t *rb, int value);
int rb_peek(const rb_t *rb, int index, int *out);
size_t rb_len(const rb_t *rb);

#endif
