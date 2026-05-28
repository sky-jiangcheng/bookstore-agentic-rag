# UI / 无障碍审查 Skill

审查前端组件的 UI 一致性和无障碍（a11y）合规性。

## 触发条件

- 手动调用：`/ui-review <file-or-directory-path>`
- 编辑 React 组件（`.tsx`）时自动提示

## 检查清单

1. **ARIA 属性**：交互元素是否有恰当的 role、aria-label、aria-describedby
2. **键盘导航**：所有交互是否可通过键盘操作（Tab, Enter, Escape）
3. **焦点管理**：模态框关闭后焦点是否回到触发元素
4. **颜色对比度**：文本与背景对比度 >= 4.5:1
5. **语义 HTML**：使用正确语义标签（nav, main, button, heading）
6. **图片 alt 文本**：所有 `<img>` 和装饰性图标是否有替代文本
7. **表单标签**：每个表单控件是否有关联的 `<label>`
8. **动画**：尊重 `prefers-reduced-motion`
9. **Tailwind 风格一致性**：使用项目的设计 token 而非硬编码值
