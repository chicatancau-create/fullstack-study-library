# 前端 / 全栈补充题（16 题）

> 面向 MS5 原岗位方向（淘系前端、到家前端、微信小程序、微信支付/蚂蚁/AI/网约车全栈）的补充题包。
> **这批题没有原始面经**，按 MS10 规则统一标为 `模拟题（公开文档题，无原始面经）`，不计入严格“已核验真题”。

## 覆盖

| 岗位 | 题型 | 题号 |
| --- | --- | --- |
| 前端 | React | FE01 列表 key、FE02 useEffect 依赖与闭包 |
| 前端 | JavaScript | FE03 事件循环、FE04 闭包与 var/let |
| 前端 | CSS | FE05 BFC 与外边距塌陷 |
| 前端 | 浏览器 | FE06 强缓存与协商缓存 |
| 前端 | 可访问性 | FE07 自定义对话框焦点管理 |
| 前端 | SSR | FE08 水合不匹配 |
| 前端 | 构建 | FE09 代码分割与 tree-shaking |
| 前端 | 性能 | FE10 LCP/INP/CLS |
| 全栈 | Node | FE11 幂等与重复提交 |
| 全栈 | 缓存 | FE12 Cache-Aside 一致性 |
| 全栈 | SQL | FE13 N+1 查询 |
| 全栈 | 契约 | FE14 offset 与游标分页 |
| 全栈 | 部署 | FE15 蓝绿/金丝雀与数据库兼容 |
| 全栈 | 故障 | FE16 线上 500 排查顺序 |

共 16 题：前端 10 题、全栈 6 题，覆盖 14 个题型。

## 每题字段

`questions.json` 每题包含：`id`、`company`、`role`、`type`、`title`、`question`、`answer`（≥5 条专属要点）、`rubric`（≥3 条评分点，逐题不同）、`followups`（≥2 条追问）、`source_url`（官方文档）、`source_type`、`evidence_status`。

答案写在题内而不是另建“标准答案模板”，避免出现所有题共用一段作答要求。

## 自测

```bash
cd 08-判定题库/国内大厂真题/_工具
node check_frontend.mjs     # 结构 / 评分点唯一 / 主题覆盖 / 模拟题标记
node build_role_matrix.mjs  # 生成 ../岗位矩阵.csv 与 evidence/role-matrix.json
```

`check_frontend.mjs` 当前 5/5 通过；`answers` 与评分点需要学习者自己先作答再对照，脚本只校验结构，不判断你的答案对错。

## 边界

- 这些题不是公司真题，也不是从牛客面经抽取；来源是 React/MDN/Node/PostgreSQL 官方文档，题目形态按公开面试常见问法编写。
- `source_url` 指向官方文档用于核对知识点，**不能当作“该公司考过”的证据**。
- 岗位矩阵中 `岗位未标注` 的 250 道算法题仍来自 CodeTop 聚合，未逐题核到原始面经；全库 `primary_evidence` 计数为 0。
- 不包含前端编码题的可执行判题环境；需要跑代码的练习请用 P02/P03/P04 的测试套件。
