# 场景 A03：拼接 SQL 与参数化的分界

## 触发条件

搜索接口在同一张 `e11.items` 上分别用字符串拼接和 `$1/$2` 参数化执行，payload 为 `' OR 1=1 --`。

## 观察到的现象

- 拼接版返回 3 行，包括 `t2` 的 “B secret”；SQL 文本出现在响应里。
- 参数化版返回 0 行，因为 payload 被当成字面量 `%' OR 1=1 --%`。
- `' OR 1=1 --` 注释掉了原 SQL 的尾部条件，这是最直接的越权读。

## 判读

- `evidence/security.txt` 必须同时出现 `returns 3 rows` 与 `parameterized query returns 0 rows`。
- 只看“接口 200”不能证明注入存在；要看行数与响应中的 SQL。

## 边界

只覆盖字符串拼接的 WHERE 条件；没有覆盖 ORDER BY、LIMIT、标识符拼接与二次注入。
