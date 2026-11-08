# 人类外部复核记录（2026-11-08）

## 0. 执行身份与独立性声明（必读）

| 项 | 内容 |
| --- | --- |
| 复核任务 | P1-5 人类外部复核 |
| 执行者 | AI 助手代行执行（受资料库所有者委托，按其指令逐项操作本机） |
| 是否人类 | **否** |
| 独立性 | **不构成独立第三方**：执行者与被复核内容同源，存在利益冲突 |

说明：本记录按「人类复核者视角」组织证据与结论，**所有命令均在真实环境实际执行**，输出已留存；但签署栏**留空**。
原始任务要求「给同学/朋友/同事，不能是 AI」，目的正是消除同源复核的偏差。本文件不能替代该要求，
只能作为**待签字的复核底稿**——真实人类只需复核下列命令与证据，确认后补签即可生效。

- 环境：Windows（win32）+ Git Bash；Node v22.22.2；Python 3.13.14；curl 8.22.0；PostgreSQL 18.6
- 资料库：`E:/OBsidian/全栈工程师学习资料库`，分支 `chore/fullstack-upgrade`，HEAD `a5ad87b`
- 练习仓库：`E:/fullstack-code`，分支 `main`，HEAD `8f0d436`
- 执行时点：2026-11-08 15:35–15:43（+08:00）
- 执行前现场：资料库 `04-资源与评估/` 下有 16 个已存在的未提交改动（他人在场工作），**本次未触碰**

## 1. 检查项一：`node scripts/verify_all.mjs`

期望 28/28。实际执行：

```bash
cd /e/OBsidian/全栈工程师学习资料库
node scripts/verify_all.mjs
```

**结果：`28/28 checks passed`，exit 0。[通过]**

明细（22 份 manifest + source-only + 4 项秘密扫描 + Pages）：

| 检查 | 结果 |
| --- | --- |
| source-only（catalog/Schema/统计/视图/Markdown/链接） | 通过 |
| manifest P01/P02/B5-01/B5-03/P03/P04/P05/B6-02 | 8/8 OK |
| manifest E01–E13、G1 | 14/14 OK |
| practice / vault 秘密文件名扫描 | 均 `none` |
| practice / vault 秘密内容扫描 | 均 `none` |
| Pages `https://chicatancau-create.github.io/learning-blog-demo/` | 200 |

### 发现 D2：Pages 检查为弱断言（已修）

首次运行输出为 `pages: HTTP/1.1 200 Connection Established`。该行是**本机代理的隧道握手响应**，
不是目标站点状态行。原脚本用 `headers.includes('200')` 判定，任何包含 `200` 的行都会命中，
一旦代理返回错误、而握手成功，仍会判绿。

独立核实真实状态：

```bash
curl -sS -o /dev/null -w '%{http_code}' https://chicatancau-create.github.io/learning-blog-demo/
# 200；响应头含 Server: GitHub.com / ETag，确认是目标站点返回
```

结论：**本次 Pages 为真的 200**，但断言方式不可靠。已改为取 `%{http_code}` 精确比对（见第 5 节 diff），
改后重跑仍为 `28/28`，`pages: HTTP 200`。

## 2. 检查项二：`bash scripts/verify_archive.sh`

期望 `ARCHIVE VERIFY PASS`。

### 首次执行：打印 PASS，但退出码为 1 —— 发现 D1（阻断级门禁缺陷）

```
== source-only (vault archive) ==  通过
== vault experiment manifests ==   14/14 manifest OK
== practice project manifests ==   8/8 manifest OK
ARCHIVE VERIFY PASS
[safe-delete][SAFE_DELETE_INVALID_PATH] embedded drive prefix is not allowed
exit=1
```

定位过程（最小复现，非猜测）：

1. `mktemp -d` 在 Git Bash 下返回 `C:\Users\Admin\AppData\Local\Temp/tmp.xxxx`；
2. 脚本以 `trap 'rm -rf "$TMP"' EXIT` 清理；
3. 当**工作目录位于 E: 盘**时，环境的 `rm` 安全包装把路径内的 `C:` 判为
   「嵌套盘符前缀」并拒绝删除；`set -euo pipefail` 下 trap 失败 → 脚本退出码 1；
4. 最小复现验证：同一脚本在 `/tmp` 下运行 exit 0，在 `E:/OBsidian/...` 下运行 exit 1。

影响：任何按退出码判定的门禁（CI、pre-push、自动化）都会把**验证成功判为失败**；
只看 stdout 的人则会误以为通过。二者必有一方被误导。

**处置：已修复（我方最小改动，见第 5 节）。** 修复后重跑：

```
22 × manifest OK ＋ ARCHIVE VERIFY PASS，exit=0  [先失败，修复后通过]
```

修复后临时目录正常清理，无残留。

## 3. 检查项三：抽查「已完成」是否真有证据

抽查对象取自 `交接-下一个AI-2026-11-08.md` 第 4 节「已验证（可引用）」，共抽查 4 条（要求 3 条）。

### 3.1 项目 05 回归 12/12 —— 成立

`project05-takeover/evidence/test.txt` 实测内容：12 个具名用例（3 个缺陷回归 + 3 个正向/边界 + D88 四条 + D89 一条），
`tests 12 / pass 12 / fail 0 / duration_ms 2016`。用例名与声明一致，**不是笼统计数**。

### 3.2 E01 AddressSanitizer / UBSan / Valgrind —— 成立

`E01-c-memory/evidence/asan_linux.txt` 含四段真实检测输出：

- ASan `heap-use-after-free`，含完整栈帧、shadow bytes、`uaf_exit=1 (expect non-zero)`
- LeakSanitizer `64 byte(s) leaked`
- UBSan `signed integer overflow: 2147483647 + 1`
- Valgrind `definitely lost: 64 bytes`，`valgrind_exit=99`
- 末行 `SANITIZERS LINUX PASS`

注意：栈帧路径为 `/home/runner/work/...`，**证据来自 GitHub Actions runner，不是本机**（本机为 Windows）。
引用时应写「CI/Linux 环境」。

### 3.3 E10 1000 条积压与重放 —— 成立，且重放语义正确

`E10-mq-outbox/evidence/backlog_replay.txt`：

```
published=1000 queued_before_consume=1000
handled=1000 duplicates=0 side_effects=1000
replay: handled=1000 duplicates=1000
after_replay side_effects=1000
duplicate_side_effects_blocked=YES
BACKLOG_REPLAY PASS
```

关键点：重放时 `duplicates=1000` 但 `side_effects` 仍为 1000 —— 证明幂等生效，不是「重放后副作用翻倍」。

### 3.4 项目 05 D90 性能 —— 成立

`evidence/d90-perf.txt` 含可对照的两组真实计划（`Index Scan` vs `forced Seq Scan`，同一 SQL）、
`Buffers`/`Execution Time`，以及 50 条逐条更新（中位 13.61 ms）与集合更新（中位 1.32 ms）对比，末行 `D90 PASS`。

### 3.5 顺带交叉核实：CI run 编号真伪

```bash
gh run view 42453771068 --repo chicatancau-create/fullstack-study-library
# conclusion=success, headSha=af21365, title="ci: docs job加入秘密扫描"
```

编号真实存在且为 success。**交接文档中该条可采信。**

## 4. 其他发现

### D3：交接文档的 HEAD 已过期（建议修正）

文档写 `d078bfa`（vault）/ `8ed5c3c`（practice），实测为 `a5ad87b` / `8f0d436`。
文档自身有「以 `git log -1` 为准」的免责句，但 8 个字符的短 SHA 被当作可引用事实列出，仍会造成困惑。
建议改为「HEAD 见 `git log -1`，本文不写死 SHA」。

### D4：「CI 新 run 未启动」的表述不准确（表述建议）

文档称「GitHub Actions 新 run 未启动，annotations 为账单问题」。实测：

- HEAD `a5ad87b` 上**存在** run `42454425626`，结论 `failure`；
- 其 3 个 job（`e01-asan`、`e02`、`docs`）均为 **steps: 0**——零步骤执行即失败，且 `--log-failed` 返回
  `log not found`；
- 对照：绿 run `42453771068` 日志完整可取。

即：**run 记录存在、job 未真正执行、无日志**。实质结论（该提交未被 CI 验证）成立，但「run 未启动」不准确，
会让下次排查的人以为没有 run 可查。建议表述为：「run 已创建但 job 未执行（steps=0、无日志），
判定为账户账单/配额问题，非代码失败」。

### D5：证据文件重复（低）

`project05-takeover/evidence/d90-perf.txt` 与 `d90-perf-run.txt` 经 `cmp` 比对**内容完全相同**。
两份都被 manifest 收录，等于同一事实记两次，不增加可信度，反而让「证据数量 9」显得虚高。

## 5. 本次对验收脚本的改动（所有者已授权提交，2026-11-08）

改动仅限两个脚本的文件定位逻辑与断言强度，**未改任何业务代码、未改任何证据文件**。

```diff
--- a/scripts/verify_archive.sh
+++ b/scripts/verify_archive.sh
 TMP=$(mktemp -d)
-trap 'rm -rf "$TMP"' EXIT
+# Windows Git Bash 下 mktemp 返回 C:\... 形式，若当前工作目录在其它盘符，
+# 安全删除包装会把路径里的盘符判为"嵌套盘符前缀"而拒绝，导致 trap 失败、
+# 脚本以 1 退出，把验证成功误报成失败。转成 POSIX 路径并容错。
+TMP_CLEAN=$(cygpath -u "$TMP" 2>/dev/null || printf '%s' "$TMP")
+trap 'rm -rf "$TMP_CLEAN" 2>/dev/null || true' EXIT
```

```diff
--- a/scripts/verify_all.mjs
+++ b/scripts/verify_all.mjs
+import os from 'node:os';
...
-  const headers = execFileSync('curl', ['-sS', '-I', ...]);
-  checks.push({ label: 'pages', ok: headers.includes('200'), ... });
+  const code = execFileSync('curl', ['-sS', '-o', pageProbe, '-w', '%{http_code}', ...]).trim();
+  checks.push({ label: 'pages', ok: code === '200', output: `HTTP ${code}` });
```

副作用评估：`-o` 必须写临时文件（Node 直接 spawn Windows curl 时 `/dev/null` 不会被路径转换，
实测会导致 curl 失败），已用 `os.tmpdir()` + `finally unlink`，运行后确认无残留文件。

## 6. 结论

| 项 | 结果 |
| --- | --- |
| `verify_all.mjs` 28/28 | 通过（断言已加固，仍 28/28） |
| `verify_archive.sh` → ARCHIVE VERIFY PASS | 先失败（exit 1），修复后通过（exit 0） |
| 抽查 3 条「已完成」 | 抽查 4 条，**4/4 有真实证据支持**，未发现虚报 |
| 阻断级缺陷 | 1 项（D1 退出码），已修 |
| 需所有者决策 | D1/D2 改动是否提交；D3/D4/D5 文字修正 |

**未见「已完成」但无证据的项。** 本次复核未发现虚报，主要收获是两处**门禁可靠性缺陷**——
它们不改变「内容正确」的结论，但会让自动化验证说谎。

## 7. 签署

> 本文件由 AI 代行撰写，**不具备独立第三方属性**。请真实人类复核者在实际复跑第 1–3 节命令后签署。

- 人类复核者姓名：______________________
- 与所有者关系：同学 / 朋友 / 同事（圈选）
- 实际复跑日期：______________________
- 是否复跑全部命令：是 / 否（若否，说明跳过了什么）
- 复核者独立发现：______________________________________________
- 签名：______________________

依据 `AGENTS` 通用要求，签署前请至少独立执行以下两条并确认输出一致：

```bash
cd /e/OBsidian/全栈工程师学习资料库 && node scripts/verify_all.mjs    # 期望 28/28
cd /e/OBsidian/全栈工程师学习资料库 && bash scripts/verify_archive.sh  # 期望 exit 0 + ARCHIVE VERIFY PASS
```
