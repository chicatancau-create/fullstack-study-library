---
schemaVersion: 1
type: exercise
exerciseId: ex-u01-pipefail
primaryLessonId: cw-u01-git-shell
supportingTopicIds: [topic-0002]
title: "用 pipefail 暴露管道上游失败"
prompt: "在临时目录运行 false | true，再启用 set -o pipefail 重跑；记录两次退出码，并解释为什么默认管道会掩盖上游失败。"
inputConvention: "在 Bash 中提交命令、退出码与一段解释；不要用 || true 吞掉失败。"
testCases: ["默认 false | true 返回 0", "set -o pipefail 后同一管道返回非 0"]
hintLevels: [L1, L2]
executionPolicy: external
language: shell
version: 1
expectedOutput: ["默认退出码=0", "pipefail退出码=1"]
evidenceChecklist: ["命令原文", "两次退出码", "失败传播解释"]
rubric: ["能复现默认掩盖", "能证明 pipefail 生效", "不伪造退出码"]
---

```bash
false | true; echo $?
set -o pipefail
false | true; echo $?
```

外部执行，不把终端输出自动判定为通过。
