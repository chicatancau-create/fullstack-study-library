# U02 自测答案

1. **盒模型四层**：content、padding、border、margin。`box-sizing: border-box` 让 `width` 包含 padding 与 border，内容宽度自动缩小；默认 `content-box` 只算内容。
2. **移动优先**：先写窄屏单列，再用 `min-width` 在大屏叠加规则；CSS 只需覆盖“更大时新增什么”，比 `max-width` 从桌面往小屏删规则更少、更稳。
3. **一个 h1**：`h1` 是页面主标题，多个会削弱文档大纲；标题层级跳级（h1→h3）会让读屏/大纲工具误判结构。用 CSS 改字号，不要用标题级别凑样式。
4. **outline: none**：键盘焦点不可见，违反焦点可见性。用 `:focus-visible` 自定义 2–3px 外框/阴影，保留可见性；不要全局删除。
5. **不能**。axe 只覆盖可自动判定的子集；键盘顺序、焦点管理、读屏播报、200% 缩放、减少动态效果、真实用户任务仍需人工验证。0 violations 只说明规则集内未命中。

## 练习提示

- 基础 2：错误提示用 `role="alert"` 或 `aria-live`，`aria-invalid="true"`，`aria-describedby` 指向错误节点；提交失败 `focus()` 回输入框。
- 边界 4：四档都用 `document.documentElement.scrollWidth - innerWidth`；不要只看截图。
- 边界 5：根字号 200% 后重新量 `scrollWidth` 和控件 `getBoundingClientRect().right`。
- 边界 6：CDP `Emulation.setEmulatedMedia` 或浏览器“减少动态效果”；确认 `animation-name` 为 `none`。