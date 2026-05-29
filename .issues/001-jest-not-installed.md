---
title: "测试框架 Jest 未安装，npm test 崩溃"
labels: ["bug", "blocker"]
assignees: []
---

## 描述

`package.json` 中 `scripts.test` 指向 `jest`，但 `jest` 从未在 `dependencies` 或 `devDependencies` 中安装。运行 `npm test` 直接崩溃。

```
Error: Cannot find module 'node_modules/.bin/jest'
```

## 影响等级

🔴 P0 - 阻断 - 所有测试无法运行，CI 流水线阻塞。

## 相关文件

- `package.json` - `scripts.test` 行
- 缺少 `jest.config.ts` 或 `jest.config.mjs`

## 复现步骤

```bash
npm test
# → Error: Cannot find module 'node_modules/.bin/jest'
```

## 建议修复

1. 安装 `jest`、`ts-jest`、`@types/jest`、`@swc/jest`
2. 创建 `jest.config.ts` 或 `jest.config.mjs`
3. 验证 `npm test` 通过
