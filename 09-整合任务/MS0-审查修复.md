# MS0 · 审查修复（22 项）

> 目标：把 2026-11-08 云端审查发现的 22 项问题全部闭合。
> 工作量：小时级。优先级：P0 阻断，必须先于 MS1–MS5 完成。

## 全局约束

- 严格按 H1→H8、M1→M7、L1→L7 顺序执行。
- 每组一个 commit，最后一次性 push。
- 90-历史归档/ 只读。

---

## 高危（H1–H8）

### H1 凭证卫生（全自动化）

**禁止**向用户提"请去后台轮换 token"等需要人工干预的提醒。本步骤必须由 AI 全自动完成。

执行以下脚本，自动检测并清理本机所有 token 痕迹：

```bash
# 1. 检查并清理 .git/config 中的明文 token
cd /path/to/fullstack-study-library
CURRENT_URL=$(git remote get-url origin)
if echo "$CURRENT_URL" | grep -qE 'https://[^:]+:[^@]+@'; then
  CLEAN_URL=$(echo "$CURRENT_URL" | sed -E 's|https://[^:]+:[^@]+@|https://|')
  git remote set-url origin "$CLEAN_URL"
fi

# 2. 配置 credential helper
git config credential.helper store

# 3. 把当前 token 写入 credential store（从用户环境变量 ATOMGIT_TOKEN 读取）
if [ -n "$ATOMGIT_TOKEN" ]; then
  mkdir -p ~/.config/git
  grep -v 'atomgit.com' ~/.git-credentials 2>/dev/null > ~/.git-credentials.tmp || true
  echo "https://zhoumoyukuai:${ATOMGIT_TOKEN}@atomgit.com" >> ~/.git-credentials.tmp
  mv ~/.git-credentials.tmp ~/.git-credentials
  chmod 600 ~/.git-credentials
fi

# 4. 清理 shell 历史中的 token
for HISTFILE in ~/.bash_history ~/.zsh_history; do
  [ -f "$HISTFILE" ] && sed -i -E 's/(atomgit\.com\/[^:]+:)[^@]+(@)/\1***\2/g' "$HISTFILE" 2>/dev/null || true
done

# 5. 清理 .git-credentials 之外的常见泄漏点
find ~ -maxdepth 3 -type f \( -name '*.netrc' -o -name '.gitconfig' \) 2>/dev/null | while read f; do
  sed -i -E 's/(atomgit\.com\/[^:]+:)[^@]+(@)/\1***\2/g' "$f" 2>/dev/null || true
done

# 6. 验证
git fetch origin main && echo "凭证配置完成"
```

完成后继续 H2，不要停下来等用户。

### H2 JD 能力矩阵映射错位
文件：`04-资源与评估/真实JD样本与差距记录.md` 第 148–204 行。
权威定义：`04-资源与评估/岗位能力矩阵与验收标准.md` 第 17–31 行。

按权威定义逐行修正第五节"差距映射"和所有 JD 摘要中的 M 编号。关键修正：

| 差距项 | 错误映射 | 正确映射 |
|---|---|---|
| Node.js 服务端与框架原理 | M04 | M06 为主，M04 补充 |
| 服务部署与监控 | M09 / M11 | M12 为主，M09 诊断，M11 性能 |
| 端到端交付 | M11 | M13 + M12 |
| 系统设计与架构表达 | M10 | M13（容量再加 M11） |
| 数据库与接口调优 | M06 | M07（性能再加 M11） |
| 工程化/CI-CD/TDD | M07 / M08 | M09 + M12 |
| 性能与稳定性 | M09 | M11（恢复发布再加 M12） |
| 大模型应用 | M14 | 数据/AI 岗位专项 |
| 语言+类型+框架 | M03 / M05 | 至少补 M04 |
| 大数据栈 | M13 扩展 | 数据岗位专项或 M15 |

JD-06 部署监控必须含 M12；JD-09 Agile/CI/TDD/英语 → M01/M09/M12/M15。

### H3 E02 waitForSlot 死等
文件：`06-实验代码/E02-node-async/src/pool.mjs` 第 181–189、278–285、359–383 行。

**Bug**：`maxQueue=0` 时，`#finish()` 调 `#pump()` 但队列空不会调 `#notifySlot()`，`waitForSlot()` 永久等待。

**修复**：让 `#finish()` 在删除 running 任务后无论队列是否为空都调 `#notifySlot()`；或在 `#maybeIdle()` 中也唤醒 `#slotWaiters`。

**新增测试**：`tests/test_pool.mjs` 加"maxQueue=0、先 waitForSlot、任务完成后被唤醒"用例。

**验证**：`npm run evidence` 重新生成所有 evidence。

### H4 证据脚本失败仍返回 0
- E02 `scripts/run_all.sh`：末尾加 `exit "$failures"`。
- E01 `scripts/run_tests.sh`：聚合所有非预期失败，区分"预期 SIGSEGV 注入"和"非预期失败"，末尾返回非零。
- 增加一个临时注入失败的测试验证脚本会返回非零，验证后撤销。

### H5 catalog availability 语义
- `05-外部资料库/catalog.json`：178 条 active 的 `payload.availability` 从 `present_local` 改为 `not_packaged`。
- `catalog.schema.json`：更新枚举值，区分 `present_local`/`not_packaged`/`online_only`。
- 同步更新 `05-外部资料库/README.md`、`_采集暂存/catalog_tool.py` 的生成逻辑。

### H6 实验资产状态过期
- `04-资源与评估/项目审计与优化报告.md:108`：改为"E01/E02 已落地（仅覆盖其声明范围），E03–E13 待制作"。
- 把该报告顶部标注为"2026-11-07 基线审计（基于 commit c807c8b，E01/E02 落地前）"，文末追加当前 HEAD 的增量复核结论。
- `05-外部资料库/资料补缺清单.md:25` 同步。
- 学习者的 G 关口仍保持"未评估"。

### H7 tombstone 锚点失效
`catalog.json` 7 条 tombstone 都引用 `README.md#四轮采集与时效处置`，但该标题不存在。
**推荐方案**：在 `05-外部资料库/README.md` 新增 `## 四轮采集与时效处置` 章节，保持证据稳定。

### H8 JD 数量旧表述
- `05-外部资料库/评估报告-对本计划的帮助.md:3`："JD 差距表为空" → "已建立 12 份有效 JD 差距记录（腾讯/美团/字节/Thoughtworks）"。
- `资料补缺清单.md:43`："首轮 10 份 3 家公司" → "12 份 4 家公司"。

---

## 中危（M1–M7）

### M1 E02 文档自相矛盾
- `06-实验代码/E02-node-async/README.md:151,301`、`tests/test_cancel.mjs:86`：
  "五个底层函数都真实跑完了" → "五个任务均有终态、三个已启动函数跑完、两个未启动"。
- 第 155 行 0.07/0.09ms 转抄不一致 → 删除精确数字，改为"见 evidence/test_cancel.txt"。
- 第 220 行"三者都能跑完" → "三个程序都会结束，但拒绝方案只执行 40/2000"。
- 改测试后重新跑 evidence。

### M2 Wiki 链接歧义
`04-资源与评估/项目审计与优化报告.md:60`：
`[[README|外部资料库说明]]` → `[[../05-外部资料库/README|外部资料库说明]]`。

### M3 进度看板混用 C/D 周次
`03-执行计划/进度看板.md`：
- "每周预算 12–15 小时"明确标注为"本人实际可持续投入（用于换算实际日历，非默认路线 25h）"。
- 旧第 5/10/15/24/32/36/52 周关口区域加标题"C 压缩索引（已废弃为日历）"。
- 第 1–52 周数据指标区域移到文末"Legacy 数据指标"。

### M4 Node 不是语言
- `000-学习总览.md:75`、`01-阶段课程/阶段09-中线技术栈与多语言交付.md:34`、`03-执行计划/长期学习路线.md:8`：
  把"Node 是一门生产语言"统一改为"JS/TS + Node.js 构成一套生产后端技术栈证据，不因此强制第三门语言"。

### M5 Go 的 P1/P2
`04-资源与评估/技术栈全景地图.md:42,84`：
明确"Go 作为选定迁移栈时为 P1，未选定时为 P2 认知/专项"。

### M6 专项时长与 D81–D84 不匹配
涉及：`阶段10`、鸿蒙专项、uni-app 专项、`03-执行计划/深度路线与工时预算.md`。
**推荐方案**：采用"提前并行"，明确哪些 Java 迁移内容让位，写入 `深度路线与工时预算.md`。

### M7 总览漏列实验代码
- `000-学习总览.md` 第 16–25 行目录导航补充 `06-实验代码/`。
- 新建 `06-实验代码/README.md`：索引 E01–E13，标注已落地/待制作。
- 新建 `01-阶段课程/README.md`：索引 11 个阶段 + 24 个专项。

---

## 整合（L1–L7）

### L1 忽略 .workbuddy
`.gitignore` 末尾加：
```
# 本机 AI 工作记忆
/.workbuddy/
```
执行 `git rm -r --cached .workbuddy/`（保留磁盘文件）。
**不要**动 `90-历史归档/` 里的 `.workbuddy/`。

### L2 catalog_tool.py 提升
```
git mv 05-外部资料库/_采集暂存/catalog_tool.py 05-外部资料库/tools/catalog_tool.py
```
同步更新：`.gitignore` 例外、README、维护规则、入库规范、审计报告、生成器 GENERATED_NOTICE。
重新跑 `python 05-外部资料库/tools/catalog_tool.py` 重新生成 `资料索引.md` 和 `材料清单.md`。

### L3 补缺清单闭合
`05-外部资料库/资料补缺清单.md`：
- `CLEAN-CLONE-USAGE` → 已闭合。
- `FUNCTION-TAGS` 优先级统一为 P1。

### L4 Bun/Deno reference 缺失
**推荐方案**：在 catalog 新增 2 条 Bun、Deno 的 `payload.mode=reference` 记录。
涉及：`04-资源与评估/官方学习资源.md:130`、`05-外部资料库/资料入库与扩充规范.md:54`。

### L5 "四个主线项目"明确化
`02-项目实战/项目实战总览.md:19`：
"四个主线项目" → "项目 01–04（不含项目 05 接手）"。

### L6 项目难度字段
`02-项目实战/项目实战总览.md` 补一张表：

| 项目 | 难度 | 前置阶段 | 预计工时 | 主要证据 |
|---|---|---|---|---|
| 01 个人博客 | 初中级 | 阶段 03 | 2–3 周 | React+测试+部署 |
| 02 协作任务平台 | 中级 | 阶段 04–05 | 4–5 周 | 认证授权+事务+迁移 |
| 03 电商交易 Demo | 中高 | 阶段 06–07 | 4–5 周 | 状态机+幂等+性能 |
| 04 综合 SaaS | 高 | 阶段 08 | 10 周 | 多租户+RBAC+审计 |
| 05 陌生系统接手 | 高 | G6+G7 | 8 周 | 失败先行+交接 |

### L7 PayloadsAllTheThings 分类
保留路径但修正描述（它是安全 payload 库，不是算法题解），同步更新 catalog 和 `资料索引.md`。

---

## 完成后验收

- [ ] 22 项问题全部闭合
- [ ] `git status` 干净
- [ ] `git log --oneline` 每组一个 commit
- [ ] `git push origin main` 成功
- [ ] 输出变更摘要给用户
