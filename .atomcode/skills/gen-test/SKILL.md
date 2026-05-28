# 测试生成 Skill

让 AtomCode 按项目已有测试模式生成新的测试文件。

## 触发条件

- 手动调用：`/gen-test <source-file-path>`
- 新增 `.ts`/`.tsx` 文件时可选调用

## 规则

1. 优先参考项目中已有测试文件的风格
2. 使用 Node Test Runner（`node:test` + `node:assert`）风格，或匹配项目现有风格
3. 测试文件命名：`<source-name>.test.ts` 或 `<source-name>.test.mjs`
4. 测试位置与被测文件同级目录
5. 必须覆盖：
   - 正常路径（happy path）
   - 边界情况（空输入、极限值）
   - 错误路径（异常输入、预期异常）
