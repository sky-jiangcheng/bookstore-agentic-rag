# API 文档 Skill

让 AtomCode 在编写或修改 API 路由时自动生成规范的开源注释和文档。

## 触发条件

- 编辑 `app/api/**/route.ts` 中的文件时自动应用
- 手动调用：`/api-doc <file-path>`

## 规则

1. 每个路由处理函数（GET, POST, PUT, DELETE, PATCH）必须有 JSDoc 注释
2. 注释格式：
   ```typescript
   /**
    * 简短描述
    *
    * 详细说明（可选）
    *
    * @param req - 请求对象描述
    * @returns 响应描述
    * @throws {Error} 错误情况描述
    */
   ```
3. 响应类型必须有 TypeScript 类型定义
4. 错误响应需统一使用 `{ error: string, code?: number }` 格式
