- 最小可点击目标：首页/列表为 40×44（导航链接），详情页为 24×24（复选框），均不低于 24×24。
- 200% 文本：375 与 1280 下 `scrollWidth` 仍等于视口宽度，无控件越界。
- 减少动态效果：默认 `animation-name: fade-in`，`prefers-reduced-motion: reduce` 下为 `none`。

### 7.2 仅键盘主路径

两个视口下相同结论（完整轨迹见 `evidence/keyboard.txt`）：

```text
1 跳到主要内容            A    outline 3px
2 学习任务清单            A    outline 3px
3 首页                    A    outline 3px
4 任务列表                A    outline 3px   ← Enter
（列表页）1..4 同上，5 记录一次真实 HTTP 请求  ← Enter
（详情页）1..4 同上，5 任务标题 INPUT
priority  SELECT（↓ 改为「低」）
done      INPUT checkbox（空格 → checked=true）
submit    BUTTON「保存任务」（Enter）
final     active=#success  text=“只用键盘完成主路径”已保存，优先级 低，已标记完成。
```

11 项检查全部为 true：到达任务链接、进入列表页、到达详情链接、进入详情页、到达标题输入、到达提交按钮、成功可见、焦点移到成功、优先级改变、复选框切换、所有焦点有可见外框。

### 7.3 跳转链接与错误状态

- 第一次 Tab 是"跳到主要内容"，Enter 后 `document.activeElement.id === 'main'`（两个视口）。
- 空标题提交：错误文案可见，`aria-invalid="true"`，`aria-describedby="title-hint form-error"`，焦点回到 `#title`，成功消息保持隐藏。

### 7.4 axe 自动扫描

| 页面 | 375 | 1280 |
| --- | --- | --- |
| index | 0 violations / 16 passes | 0 violations / 16 passes |
| tasks | 0 / 16 | 0 / 16 |
| task | 0 / 23 | 0 / 23 |

规则集：`wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa`；`incomplete` 为 0。

**0 violations 不是"WCAG 合规"证明**：axe 只能覆盖可自动判定的子集，键盘顺序、焦点管理、读屏语义和真实用户体验仍需人工检查或被明确标为未验证。

## 8. WCAG 2.2 AA 对照（本页适用项）

| 准则 | 级别 | 本实验的证据 | 方式 | 结论 |
| --- | --- | --- | --- | --- |
| 1.3.1 Info and Relationships | A | 原生 header/nav/main/footer、label、列表、标题层级 | axe + 人工读结构 | 通过（本页范围） |
| 1.4.3 Contrast (Minimum) | AA | axe `color-contrast` 无违规 | 自动 | 通过（自动覆盖范围） |
| 1.4.4 Resize Text | AA | 根字号 200% 后无横向溢出、无控件越界 | 人工脚本 | 通过（文本放大，不是浏览器 UI 缩放） |
| 1.4.10 Reflow | AA | 320 CSS px 无横向滚动 | 人工脚本 | 通过 |
| 2.1.1 Keyboard | A | 仅键盘完成主路径 | 人工脚本 | 通过 |
| 2.4.1 Bypass Blocks | A | 跳转链接把焦点送到 main | 人工脚本 | 通过 |
| 2.4.7 Focus Visible | AA | 所有 Tab 停靠点 3px 实线外框 | 人工脚本 | 通过 |
| 2.5.8 Target Size (Minimum) | AA | 最小 24×24；导航 40×44 | 人工脚本 | 通过 |
| 3.1.1 Language of Page | A | `<html lang="zh-CN">` | axe | 通过 |
| 3.3.1 Error Identification | A | 空标题显示文本错误并回焦 | 人工脚本 | 通过 |
| 3.3.3 Error Suggestion | AA | 错误文案给出 1–60 字符规则 | 人工脚本 | 通过 |
| 4.1.3 Status Messages | AA | `role="status" aria-live="polite"` + 焦点移动 | 人工脚本 | 通过（未用读屏实测播报） |

未验证/不适用：读屏软件的实际播报、1.4.11 非文本对比度、1.2.x 媒体替代内容（本页无媒体）、2.2.x 时间限制（无）、复杂组件模式（本页无）。减少动态效果（2.3.3 属 AAA）只作为偏好检查，不计入 AA 通过项。

## 9. 边界：这套装置**没有**证明什么

1. **不是真实设备**：375×812 与 1280×800 是 CDP 的 CSS 视口，没有真实触摸、软键盘、系统字体缩放或厂商浏览器差异。
2. **不是读屏测试**：只保证语义标记与 `role/aria-*` 存在，没有验证 NVDA/VoiceOver 的实际朗读顺序与播报内容。
3. **不是跨浏览器结论**：只测 Edge 157；Firefox/Safari 的焦点与表单行为未复测。
4. **axe 覆盖有限**：0 violations 只说明规则集内未命中，不能推出"对所有残障用户可用"。
5. **键盘脚本是合成输入**：CDP 发送的是浏览器级按键事件（不是 JS `click()`），但仍不是真人操作；焦点轨迹可复核，不能替代用户测试。
6. **200% 检查的等价性**：CSS 根字号放大接近"仅文本缩放"，不等同于浏览器整页缩放；后者未测。
7. **无后端**：表单只在浏览器内演示错误/成功状态，没有真实持久化或权限校验。

## 10. G1 映射与相关实验

| G1 要求 | 本实验覆盖 | 证据 |
| --- | --- | --- |
| 键盘与可访问性：手机/桌面布局下仅用键盘完成主路径，并有检查记录 | **是**（第 7 节） | `evidence/keyboard*.json/txt`、`layout.txt`、`axe*.json`、`screenshots/` |
| 网络解释：状态码、Cookie、缓存、CORS、链路 | 否 | [E04 网络实验](../E04-http-network/README.md) |
| 内存定位 | 否 | [E01 C 内存实验](../E01-c-memory/README.md) |
| 渲染链路（HTML 解析 → 布局 → 绘制） | 仅布局/重排的可观察结果，无渲染时序 | 本实验第 7.1 节 |

说明：[E01 的 README](../E01-c-memory/README.md) 第 146 行把键盘项指向"E05"；实验清单里的 E05 是 **G3/G6** 的构建/渲染模式实验。本实验只承担 G1 的键盘与响应式最小站点，不宣称完成 E05。

结论：**本实验完成 ≠ G1 通过**；三项都具备证据后，才在 `03-执行计划/进度看板.md` 里单独评估。