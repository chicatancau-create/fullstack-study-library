# G1 故障变体（第二套抽测）

在答案上制造受控缺陷，确认对应自测脚本会失败；修复后再次通过。

## 站点题（改 `参考答案/site/index.html`）

| 编号 | 注入缺陷 | 应失败断言 | 已实测输出 |
| --- | --- | --- | --- |
| S1 | 删掉 `<img>` 的 `alt` | `A3 图片 alt 完整`（axe 同时报 image-alt critical） | `violations=1 serious_or_critical=1: image-alt(critical)` |
| S2 | 对比度改回 `#eeeeee` / `#bbbbbb` | `A1 axe 无违规` | `color-contrast(serious)` |

## HTTP 题（改 `参考答案/server.mjs`）

| 编号 | 注入缺陷 | 应失败断言 | 已实测输出 |
| --- | --- | --- | --- |
| H1 | `if (inm === ETAG)` → `if (false)` | `H3 If-None-Match → 304` | `status=200` |
| H2 | CORS 判断去掉白名单 | `H7 CORS 白名单` | `非白名单也回 ACAO: http://evil.example` |

## C 题（改 `参考答案/c/ring_buffer.c`）

| 编号 | 注入缺陷 | 应失败断言 | 已实测输出 |
| --- | --- | --- | --- |
| C1 | 删掉 `if (rb->len >= rb->cap) return -2;` | 探针 `rc=2` | `full-push rc=0 len=4` → `probe: FAIL(2)` |
| C2 | 负索引检查去掉，只留 `index >= (int)len` | 探针 `rc=3` | `negative-index returned 0` → `probe: FAIL(3)` |

## 函数题（改 `参考答案/index.mjs`）

| 编号 | 注入缺陷 | 应失败断言 | 已实测输出 |
| --- | --- | --- | --- |
| F1 | 删掉 `img-alt` 判断 | `缺失项全部报出` | `["html-lang","input-label","viewport"] != [...]` |
| F2 | 删掉 `viewport` 判断 | `缺失项全部报出` | `["html-lang","img-alt","input-label"] != [...]` |

F1–F2、S1–S2、H1–H2、C1–C2 共 8 个，全部由 `scripts/mutation_check.mjs` 自动复现，`npm run evidence` 会写进 `evidence/mutation.txt`。

## 记录模板

```
变体编号：C2
缺陷描述：去掉 if (index < 0) return -1;，只留 index >= (int)len
失败断言：C 探针 rc=3
复现命令：bash scripts/run_c.sh <变体 ring_buffer.c> $TMP/g1c
失败输出：negative-index returned 0, out=...
修复后输出：c-probe ok / probe_rc=0
```
