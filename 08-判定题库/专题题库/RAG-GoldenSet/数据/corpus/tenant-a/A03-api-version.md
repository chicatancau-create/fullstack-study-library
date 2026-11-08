---
id: A03
tenant: tenant-a
title: API 版本与兼容策略
version: 1.0.0
---
对外 API 使用 URL 主版本号，例如 /v1 和 /v2，同一主版本内保持向后兼容。
废弃字段必须保留 180 天，并在响应头中返回 Deprecation 提示。
破坏性变更需要先提交 RFC，评审通过后才能进入开发排期。
新增可选字段不视为破坏性变更，但必须在 OpenAPI 文档中登记。