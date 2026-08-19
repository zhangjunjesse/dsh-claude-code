你是 Claude Code，在一个 DSH 插件开发仓库工作。你的任务：**评估一个 UI 需求的可行性，并产出一份完整的设计文档**。只写文档，不改任何代码。

# 需求（用户原话整理）

dsh-claude-code 插件（DSH 的 Claude Code 委派插件，当前 0.2.0）已经有后台任务能力（run_in_background 接入 DSH 的 ctx.jobs）。现在用户想要：
1. 一个 UI 面板，能"看到 Claude Code 的窗口"——即：委派任务是否在正常执行、执行情况（状态/进度）、实时输出（像终端一样滚动）。
2. 入口位置：**DSH 会话顶部，"对话 / 轨迹"视图 tab 的右边增加一个 tab**（即第三个视图 tab，点击后整个会话体切换为 Claude Code 监控面板）。

# 项目背景

- 插件仓库：C:\Users\Administrator\Desktop\dsh-workspace\space-开发-dsh插件开发
- 现状：src/index.ts 是纯 Host 端插件（注册 claude_code 工具 + claude-code-delegation skill），无任何 Client/UI 代码。
- 后台任务实现：ctx.get('jobs').start({kind:'claude-code', label, owner: exec.agent, run: () => ({cancel, done, readOutput})}) → jobId；readOutput 返回增量文本（流式）；done 为 {status:'completed'|'failed'|'killed', detail, output}。
- 想了解 0.2.0 全貌，读：src/index.ts、SPEC-0.2.0.md、STATUS.md、package.json。

# 已核实的 DSH UI 插件机制（直接用，不用重新猜）

1. **静态 npm 插件的 UI 声明**（参照已装的 dsh-better-sidebar@0.12.3，路径 C:\Users\Administrator\.dsh\profiles\desktop\node_modules\dsh-better-sidebar\）：
   - package.json 里 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" }, "client": { "inject": ["@deepseek-ai/dsh-client-runtime", ...], "platform": "web" } }`
   - 提供 `"./client"` 导出 → 打包后的 client bundle（lib/client.js）
   - client bundle 是 `window.__ModuleLoader__.load({ id, factory: (require) => {...} })` 格式（Web 客户端模块加载器）
   - Client 端注册 UI 用 slots 服务：`ctx.slots.inject("<slot名>", () => ctx.slots.register({ id, component }))`
2. **Slot 落点（本机 DSH 的实时 Slot 树，已用 inspect 确认）**：
   - `conversation.view`（list, scope session）："The conversation view ring: one list entry per view tab (chat here; trajectory/waterfall from ui-trajectory), rendered one-at-a-time by the session body via `only: <active id>`" —— **这就是"对话/轨迹"所在的视图 tab 环，新增第三个 tab 即实现"对话/轨迹右边加一个 tab"**。
   - `conversation.session.header`（single）：会话顶部条（标题、view tabs、操作行）。
   - `conversation.session.header.utilities`（list）：右对齐会话工具（可选入口备选）。
   - `conversation.session.header.actions`（list）：会话头操作行按钮（备选入口）。
   - `conversation.details.tool`（single）：右侧详情列（备选：选中任务后展示详情）。
   - `conversation.chat.node` / `tool.call.toolview`（keyed）：chat 视图内按 kind/tool 名分发的节点渲染。
3. **Host↔Client 数据通道**：动态 Cordis 插件的约定是 Host 用 `harness.handle(method, handler)`，Client 用 `host.call(method, args)`（JSON 方法，Client→Host 方向）。**静态插件的确切 RPC API 需要你从本机源码确认**（见下方参考路径）。
4. **后台任务数据源**：Host 端 `ctx.jobs`（dsh-jobs-local 实现）已有 list/get/read/kill 与 onJobDone/onJobsChanged 通知；Client 端 dsh-client-ui-jobs 已有通用 jobs 面板可参考。

# 参考源码路径（本机可读，务必读）

- DSH 包源码（编译产物 lib/index.js 可读，含 JSDoc）：C:\Users\Administrator\AppData\Local\Programs\DSH Desktop\resources\app.asar.unpacked\node_modules\@deepseek-ai\
  - dsh-client-runtime\、dsh-client-ui-slots\、dsh-client-ui-conversation\、dsh-client-ui-jobs\、dsh-client-web-react\、dsh-client-ui-primitives\、dsh-jobs\、dsh-jobs-local\
- dsh-better-sidebar（带 TS 源码 src/，最佳参考）：C:\Users\Administrator\.dsh\profiles\desktop\node_modules\dsh-better-sidebar\（重点看 src/index.ts、src/client/ 下 slots 注册、package.json 的 client 声明与构建脚本 tsdown）
- 本插件 0.2.0：C:\Users\Administrator\Desktop\dsh-workspace\space-开发-dsh插件开发\

# 你要交付的评估与设计（写入 C:\Users\Administrator\Desktop\dsh-workspace\space-开发-dsh插件开发\docs\UI-DESIGN-0.3.0.md，中文）

文档需覆盖：

1. **可行性评估**：这个需求能否用 DSH 的 Slot/Client 插件机制实现？明确"可行/部分可行"及理由。指出最合适的 Slot 落点（conversation.view 新 tab 为主方案，header 按钮/详情列为备选）并说明取舍。
2. **UI 结构设计**：监控面板的内容与布局：
   - 任务列表（状态徽标：running/completed/failed/killed + label + jobId）
   - 选中任务的"Claude Code 窗口"：实时输出区（等宽字体、自动滚动、支持增量追加、[tool] 标记高亮）、执行统计（turns/耗时/费用）、操作（取消 job_kill、展开/收起）
   - 空态（无任务时）与任务完成态
3. **数据流设计**：Host→Client 如何拿到任务列表与实时输出增量：
   - 方案：插件 Host 端注册 JSON 方法（list/get/attach/readOutput）或事件推送；评估轮询 vs 推送；给出推荐与理由
   - 注意 jobs 的 owner 隔离（每个会话只能看自己的任务）
4. **组件与代码结构**：文件划分（Host 端 RPC 注册、Client 端 view tab 组件、实时输出组件）、Client 入口怎么接线（dsh.client.inject、slots.inject/register）、与现有 0.2.0 代码的集成点（startBackgroundJob 处把 jobId 暴露出来）
5. **构建与打包**：参考 better-sidebar 的 tsdown/tsc 构建与 package.json client 导出；评估给 dsh-claude-code 加 Client 端需要改什么（构建脚本、exports、files、peerDeps）
6. **里程碑拆分**：MVP（任务列表 + 实时输出 + 取消）→ v2（历史/统计/自定义）→ 远期（直接把 claude 交互嵌入？），每步验收标准
7. **风险与待确认点**：例如静态插件 client bundle 的构建工具链细节、host.call 在静态插件的确切形态、jobs 数据在 Client 端的可达性、Slot 在无会话(hero)时的表现——逐条给出"如何确认"

# 约束

- 只产出 docs\UI-DESIGN-0.3.0.md 一份文档；不改源码、不动 node_modules、不跑构建。
- 文档要基于你实际读过的源码结论写，标注关键 API 出处（文件路径 + 大致行号或 JSDoc）。
- 完成后用中文总结：可行性结论一句话、推荐的 Slot 与数据流方案一句话、MVP 范围一句话。
