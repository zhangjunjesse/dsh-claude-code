# IMPLEMENT-0.3.5：Claude Code 面板 Markdown 直接预览

你是 Claude Code，在 dsh-claude-code 插件仓库实现 0.3.5。**先读完本文件，再动手。**

## 0. 目标

面板输出区（EventView）里 `text` 事件现在按纯文本 pre-wrap 渲染。用户要求：**Markdown 直接预览**——assistant 的 markdown 文本渲染成排版后的内容（标题/粗体/代码块/列表/链接/引用等），而不是显示源码。

## 1. 必读

- `src/client/EventView.tsx`（`text` 事件 → `kind:'text'` 节点的渲染处）
- `src/client/styles.ts`（样式 token + 主题变量约定，前缀 `ccp-`）
- `src/client/locales.ts`（如需要文案）
- 约束：**不引入任何依赖**（seed 白名单只有 react/react/jsx-runtime/primitives 等，且之前 client bundle 的 requires 已收敛到 react 与 react/jsx-runtime）

## 2. 实现

### 2.1 新增 `src/client/md.ts` —— 手写轻量 Markdown→React 渲染器（零依赖）

- 输入：markdown 字符串；输出：React 元素树（**不要用 dangerouslySetInnerHTML**——所有输入文本必须转义成文本节点，绝不允许内嵌 HTML 生效）。
- 支持的语法（够用即可，不必全 spec）：
  - 标题 `#`~`######`
  - 段落、硬换行
  - 行内：`**粗体**`、`*斜体*`、`` `行内代码` ``、`[链接](url)`
  - 代码块 ```` ```lang\n...\n``` ````（渲染为 `<pre><code>`，lang 只作 className 提示，不做高亮）
  - 无序列表 `- ` / `* `，有序列表 `1. `
  - 引用 `> `
  - 分隔线 `---`
  - 表格不做（超出范围）
- 安全细则：
  - 文本中的 `<`/`>`/`&` 一律转义为文本（React 元素天然转义，注意别用 dangerouslySetInnerHTML）
  - 链接 href：只允许 http(s): 前缀（其他协议丢弃为纯文本），`target="_blank"` + `rel="noopener noreferrer"`
  - 行内代码与代码块内容原样文本
- 解析器建议结构：先按行分块（代码块/引用/列表/标题/分隔线/段落），块内再解析行内语法（用简单的扫描函数处理 `**`/`` ` ``/`[x](y)`）。保持代码清晰、有函数级注释。**不要过度工程**——能渲染常用 markdown 即可，边缘情况宽容处理（解析失败就整块按纯文本）。

### 2.2 EventView.tsx
- `text` 节点渲染改为 `<Markdown text={node.text} />`（从 md.ts 导入）。
- 空文本仍跳过；长文本上限逻辑保留。
- 可加一个很小的"查看原文/预览"切换按钮（默认预览；点原文看纯文本）——若加，文案进 locales（zh/en：`output.raw` / `output.preview`）。**可加可不加**，优先保证预览渲染正确。

### 2.3 styles.ts
- 新增 md 渲染样式 token（`ccp-md*`）：标题字号层级、粗体、行内代码（浅底色 + 等宽）、代码块（深一点底、等宽、内边距、圆角、横向滚动）、引用（左边框 + 灰）、列表缩进、链接颜色（主题 primary）。
- 全部走主题变量；`.ccp-evText`（text 节点容器）从 `pre-wrap` 改为普通段落流（块级元素由 md 渲染决定），行内间距正常化。

## 3. 验收

1. `npm run typecheck`（node+client）0 错误；`npm run build` 通过；`lib/client.js` 仍 `__ModuleLoader__.load({id:"dsh-claude-code"})`，requires 不新增任何第三方包。
2. 用 `renderToStaticMarkup` 验证 md.ts（构造样本）：`# 标题` → `<h1>`；`**粗体**` → `<strong>`；`` `code` `` → `<code>`；```js 代码块 → `<pre><code>`；`- a` 列表 → `<li>`；`[x](https://a.b)` → `<a href target=_blank rel>`；输入 `<script>alert(1)</script>` → **不出现** `<script` 标签（被转义成文本）。
3. EventView 里 text 节点用 `<Markdown>` 渲染后，整面板 renderToStaticMarkup 仍正常（任务 tab/额度栏/工具卡片不受影响）。
4. `package.json` 版本 → 0.3.5；`CLIENT_APP` 同步；CHANGELOG 顶部加 `## 0.3.5`（英文一句）；README 面板描述补"Markdown 直接预览"。

## 4. 约束

- 零新增依赖；不改 jobs seam / remote / tracker / cordis.patch.yml。
- 完成输出：改动文件清单、构建结果、md.ts 的 renderToStaticMarkup 断言结论（含 `<script>` 转义验证）、lib/client.js id 与 requires 确认。
