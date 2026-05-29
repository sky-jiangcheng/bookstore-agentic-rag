---
title: "tests/setup.mjs 通过 hack CJS require cache 模拟 server-only，方案脆弱"
labels: ["test", "medium"]
assignees: []
---

## 描述

`tests/setup.mjs` 通过手动填充 Node.js CJS `require.cache` 来模拟 `server-only` 模块，使测试能在 tsx 环境下运行。这种方式非常脆弱：

1. 依赖 `require.cache` 的内部实现细节，非公共 API
2. 如果 `server-only` 的入口文件路径（package.json exports）变更，hack 会静默失败
3. 导入顺序变化可能导致 `server-only` 在 mock 生效前已被加载并抛出异常
4. 当前 `tests/` 目录下没有任何实际测试文件，但 setup 代码存在

## 影响等级

🟡 **P3** — 潜在测试基础设施脆弱性

## 相关文件

- `tests/setup.mjs`
- `package.json:12` — test 命令

## 建议修复

1. 使用 `vitest` 替代 `tsx` 运行测试（vitest 原生支持 `server-only` mock）
2. 或使用 `jest.mock('server-only', () => ({}))`（jest 模式）
3. 或放弃 `server-only` 改用运行时检查（如 `typeof window === 'undefined'`）
4. 当前没有测试文件，可考虑先清理 setup.mjs，待写入实际测试后再决定方案
