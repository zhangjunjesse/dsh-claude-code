# IMPLEMENT-0.3.1：Claude Code 面板"原生输出"渲染

你是 Claude Code，在 dsh-claude-code 插件仓库实现 0.3.1 的 UI 增强。**先读完本文件与相关设计文档，再动手。**

## 0. 目标

当前监控面板（conversation.view 第三个 tab）的输出区是**简化文本流**：只显示 assistant 文本 + `[tool] Name` 行。用户希望面板输出区**更接近 Claude Code 原生终端体验**：

- assistant 文本正常展示
- **thinking（思考）块**：灰色、可折叠展开
- **tool_use 卡片**：工具名 + 完整参数 JSON（默认单行截断，可点击展开）
- **tool_result 卡片**：工具执行结果（截断 + 可展开）
- 消息按时间顺序排列，工具调用成组呈现（工具名徽标 + 参数 + 结果）

## 1. 必读

- `src/index.ts`（当前实现：runClaude / createBuffer / startBackgroundJob / tracker 集成；onDelta 回调）
- `src/tracker.ts`（JobTracker：full/pending 文本缓冲、read(fromOffset)、结算回填）
- `src/remote.ts`（ClaudeCodeRemote：listJobs/readOutput/cancel）
- `src/client/`（ClaudeCodeView.tsx / OutputView.tsx / api.ts / types.ts / locales.ts / styles.ts）
- `docs/UI-DESIGN-0.3.0.md`（原设计：§3.2 RPC、§4 JobTracker、坑 A/B 绕行原则——**输出读取必须用绝对 offset、绝不能碰 ctx.jobs.read() 单游标**）
- SDK 消息结构：`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` 里 SDKAssistantMessage / SDKUserMessage / SDKPartialAssistantMessage 的 content blocks（text / thinking / tool_use / tool_result 结构）

## 2. Host 端改动（结构化事件流）

原则：**不破坏现有文本流**（模型侧 `job_output` 依赖它，`readOutput` 返回的仍是增量文本），**另加一个结构化事件流**供 UI 消费。

1. `src/index.ts` 的 runClaude：
   - 保留现有 onDelta(文本) 回调（pending/full 缓冲不变，job_output 兼容不变）
   - 新增/扩展一个 `onEvent(evt)` 回调，emit 结构化事件。事件类型（记录为 JSON 行，字段全部纯 JSON）：
     - `{ type: 'text', text: string }` —— assistant 文本块（block.type === 'text'）
     - `{ type: 'thinking', thinking: string, signature? }` —— thinking 块（block.type === 'thinking'，SDK 0.3.233 中 block 结构按实际类型为准）
     - `{ type: 'tool_use', name: string, input: object }` —— tool_use 块（input 是参数 JSON；序列化失败的用 String(input) 兜底）
     - `{ type: 'tool_result', tool_use_id: string | null, content: string }` —— user 消息里的 tool_result（content 可能是 string 或数组，统一转字符串；**超长截断**到 ~2000 字符并加 `…[truncated]` 标记）
     - `{ type: 'result', text: string, costUsd?, numTurns?, durationMs? }` —— result 消息（可选）
     - 每类事件保持相对顺序（按消息流到达顺序）
   - stream_event（text_delta / thinking_delta）不单独成事件（面板以完整块为单位渲染，避免闪烁）；文本增量仍走 onDelta 保持 job_output 实时性
2. `src/tracker.ts`：TrackedJob 增加 `events` 缓冲（绝对 offset 的 JSON 行数组，环形上限 ~2000 行；行内不含换行——用 JSON.stringify 保证单行）；新增 `readEvents(fromOffset)` 返回 `{ events: parsed[], nextOffset }`（增量语义，读后不动游标——多消费者安全）
3. `src/remote.ts`：新增 `@Remote readEvents(sessionId, jobId, fromOffset): Promise<{ events: unknown[], nextOffset: number }>`（校验 ownerSessionId，同 readOutput 风格）
4. `src/client/types.ts`：补 `ClaudeEvent` 联合类型（与上述事件对应）

## 3. Client 端改动（原生风格渲染）

1. `src/client/api.ts`：加 `readEvents(jobId, fromOffset, signal)`
2. `src/client/OutputView.tsx`（或拆 `EventView.tsx`）重构：
   - 数据源：优先 `readEvents`（1s 轮询增量，只有 tab 激活且任务 running 时轮询；终态补拉一次）；`readOutput` 文本流保留为兜底/统计
   - 渲染（按事件类型，样式在 styles.ts 里加 token）：
     - `text` → 普通文本块（等宽或正文，保持 pre-wrap）
     - `thinking` → 灰色斜体块，默认折叠成一行「💭 思考中…（点击展开）」，点击展开全文
     - `tool_use` → 卡片：左侧工具徽标（如 `[Edit]`，按工具名着色）+ 参数 JSON 单行（`JSON.stringify`，截断 ~200 字符 + 可点击展开为 pre 全文）
     - `tool_result` → 卡片：结果文本（等宽 pre-wrap，截断 ~800 字符 + 「展开/收起」）
     - 工具卡片与紧随的 tool_result 视觉成组（tool_result 缩进/同底色）
     - `result` → 任务结束摘要块（绿/蓝底色：`✅ 完成 · $x.xx · N turns · NmNs`）
   - 保留：自动滚动（用户上滚暂停）、复制输出、复制会话 id、取消按钮
   - 空态/无事件时显示占位
3. 保持 React 18 + 只 require seed 白名单（react、react/jsx-runtime、@deepseek-ai/dsh-client-ui-primitives）；不引入 markdown 渲染库（原生文本即可，避免新增依赖）

## 4. 验收

1. `npm run typecheck`（node + client）0 错误；`npm run build` 成功；`lib/client.js` 仍为 `window.__ModuleLoader__.load({id:"dsh-claude-code"})` 包装，seed 白名单不变
2. `lib/remote.js` 含 readEvents；`lib/tracker.js` events 缓冲与 readEvents 实现正确
3. 用 node 直接跑一次 tracker 单测（或写个临时脚本）：构造几类事件 → readEvents 增量语义正确（fromOffset 0 → 全量；再次调用 → 空；多消费者并行读不互相影响）
4. 不破坏：readOutput 文本流、job_output 兼容、取消路径（cancelFromUi → killed）不变
5. CHANGELOG 0.3.0 下追加一条 0.3.1 说明（英文）；README 面板描述更新一句（可选）

## 5. 约束

- 不改 jobs seam；不 fork/patch @deepseek-ai 包；不动 cordis.patch.yml
- 改动尽量收敛：Host 端 3 个文件 + Client 端 4~5 个文件
- 完成输出：改动文件清单、构建结果、readEvents 增量语义验证结论、lib/client.js id 确认
