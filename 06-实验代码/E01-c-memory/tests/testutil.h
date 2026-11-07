#ifndef TESTUTIL_H
#define TESTUTIL_H

#include <stdio.h>

static int g_fails = 0;
static int g_checks = 0;

#define CHECK(cond)                                                            \
    do {                                                                       \
        g_checks += 1;                                                         \
        if (!(cond)) {                                                         \
            g_fails += 1;                                                      \
            printf("FAIL  %s:%d  %s\n", __FILE__, __LINE__, #cond);            \
        }                                                                      \
    } while (0)

#define CHECK_EQ_INT(actual, expected)                                         \
    do {                                                                       \
        long a_ = (long)(actual);                                              \
        long e_ = (long)(expected);                                            \
        g_checks += 1;                                                         \
        if (a_ != e_) {                                                        \
            g_fails += 1;                                                      \
            printf("FAIL  %s:%d  %s == %s  (got %ld, want %ld)\n", __FILE__,   \
                   __LINE__, #actual, #expected, a_, e_);                      \
        }                                                                      \
    } while (0)

#define TEST_REPORT(name)                                                      \
    do {                                                                       \
        printf("%-28s checks=%d fails=%d : %s\n", name, g_checks, g_fails,     \
               (g_fails == 0) ? "PASS" : "FAIL");                              \
        return (g_fails == 0) ? 0 : 1;                                         \
    } while (0)

#endif /* TESTUTIL_H */
