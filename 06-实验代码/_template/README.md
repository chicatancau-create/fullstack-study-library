# 实验模板与证据规范

本目录不是实验，是 E01 起的统一约定：

| 文件 | 用途 |
| --- | --- |
| `README-template.md` | 新实验 README 的必填结构：假设、环境、命令、证据、边界、M/G 映射 |
| `manifest.mjs` | 生成/校验证据 manifest（文件 SHA-256、提交、运行时、命令退出码） |
| `toolchain.json` | 本机固定工具链版本；升级时同步锁文件与证据 |
| `ci.yml` | CI 最小模板；**未在远端实跑**，启用前先核对 runner |

## 用法

```bash
# 在实验目录内生成 manifest
node ../_template/manifest.mjs make \
  --experiment E01 \
  --output evidence/manifest.json \
  --files=evidence/build.txt,evidence/env.txt,evidence/test_run.txt \
  --command="bash scripts/run_tests.sh|0" \
  --command="bash scripts/selftest_gate.sh|0" \
  --unverified="ASan 不可用；跨平台未测"

# 校验：文件存在且 SHA-256 一致
node ../_template/manifest.mjs verify evidence/manifest.json
```

## 规则

1. manifest 只记录**已经生成**的证据文件；缺文件直接失败，不填占位。
2. `commands` 里的退出码必须来自真实执行；不能写“预期 0”。
3. 每次重跑证据后重新生成 manifest；旧 manifest 不覆盖历史提交，历史由 Git 保存。
4. 依赖固定：Node 用 `package-lock.json`/`engines`，C 用固定编译器与 flags；不写“最新版”。
5. 没有 manifest 校验、没有主动破坏记录、没有干净环境复现的资产，不能标“限定范围验收通过”。
6. CI 模板未实跑；只有拿到真实 CI 运行 URL、提交和退出码，才能写“CI 通过”。