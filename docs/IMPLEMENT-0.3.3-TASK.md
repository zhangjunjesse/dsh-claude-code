# IMPLEMENT-0.3.3：Claude Code 面板顶部"额度状态栏"

你是 Claude Code，在 dsh-claude-code 插件仓库实现 0.3.3。**先读完本文件，再动手。**

## 0. 目标

现在 `claude_code_usage` 工具只能通过对话调用看文本输出。用户希望**直接在「Claude Code」监控面板（第三个 tab）顶部友好地展示额度**：订阅类型、5h/7d 双窗口进度条、模型专项（如 Fable）、状态徽标、刷新。

## 1. 必读

- `src/usage.ts` —— `readUsageSnapshot()`（读 ~/.claude.json 缓存 + auth status 兜底）、`UsageSnapshot` 类型、`renderUsage`（参考其文案）；**只读此文件，不重复实现读取逻辑**
- `src/remote.ts` —— `ClaudeCodeRemote extends TypertRemoteService`，现有 `listJobs/readOutput/readEvents/cancel` 的写法与**约束**（ownerSessionId 校验、参数名不能叫 session/agent、返回必须纯 JSON——undefined 会被拒，需转 null 或省略）
- `src/client/ClaudeCodeView.tsx` —— 面板主组件（左列表 + 右输出），额度栏应加在**面板顶部（列表+输出上方）**
- `src/client/api.ts` / `types.ts` / `locales.ts` / `styles.ts` —— 现有 RPC 封装 / 类型 / 文案 / 样式 token 的写法
- `src/tracker.ts`（了解 TrackedJob 结构，不需要改它）

## 2. Host 端改动

1. `src/remote.ts`：新增 `@Remote usage(sessionId: string): Promise<UsageSnapshotWire>`：
   - 复用 `readUsageSnapshot()`（参数：staleAfterMinutes 用默认 30，forceRefresh false——不做主动刷新，见下）
   - **返回前做 JSON 安全化**：把结果里所有 `undefined` 字段转 `null`（或省略），确保 gateway 不拒（参照现有 `toJobInfo()` 的条件展开写法）
   - 校验 ownerSessionId（同其他方法）；异常时返回 `{ ok:false, error:'...' }` 形状而非 throw（让 UI 可降级）
2. 不引入主动刷新（forceRefresh 保持占位：工具已提示"暂不支持"；UI 刷新按钮只是重新拉一次缓存）

## 3. Client 端改动

1. `src/client/api.ts`：加 `getUsage(sessionId, signal)` 调 `claudeCode/usage`，结果按 `{ok,value}|{ok:false}` 白名单校验
2. `src/client/types.ts`：加 `UsageView` 类型（对齐 UsageSnapshotWire 的展示所需字段：loggedIn、subscription{type,rateLimitTier}、fiveHour{utilizationPercent,resetsAt}、sevenDay{...}、limits[]（含 scoped 专项）、advice、cache{ageMinutes,maybeStale}、warnings[]）
3. `src/client/UsageBar.tsx`（新组件，放在 ClaudeCodeView 顶部）：
   - 订阅行：`Claude Max · 20x`（type + rateLimitTier 简化展示）+ 缓存年龄（如 `缓存于 2 分钟前`）+ 刷新按钮（重新拉取）
   - **5h 窗口进度条**：百分比 + 重置时间（`2% · 约 12:50 重置`）
   - **7d 窗口进度条**：百分比 + 重置时间（`3% · 8/25 21:00 重置`）
   - **模型专项**（limits 里 kind==='weekly_scoped' 且 scopeModel 非空）：`Fable 0%` 小徽标一行
   - **advice 状态徽标**：normal=绿「正常」/ caution=黄「注意」/ blocked=红「已阻塞」，+ advice 文案
   - 加载中（骨架/「加载中…」）、未登录（`请先运行一次 claude 登录`）、失败（`额度读取失败：<error>` 可重试）三态降级
   - 进度条颜色：百分比 ≥80 → 红、≥50 → 黄、否则主题绿/蓝；宽度按百分比（clamp 0-100）
   - 样式 token 加在 styles.ts（前缀沿用 `ccp-`，用主题变量）
4. `locales.ts`：zh/en 补额度栏文案（订阅/5h 窗口/7d 窗口/模型专项/正常/注意/已阻塞/刷新/缓存于/请先登录/读取失败/加载中）
5. `ClaudeCodeView.tsx`：顶部渲染 `<UsageBar sessionId=... />`；挂载时拉一次 + 每 5 分钟自动刷新（定时器清理干净）；不阻塞任务列表/输出的既有逻辑

## 4. 验收

1. `npm run typecheck`（node+client）0 错误；`npm run build` 通过；`lib/client.js` 仍 `__ModuleLoader__.load({id:"dsh-claude-code"})`，seed 白名单不变
2. `lib/remote.js` 含 `usage` 方法；`lib/usage.js` 未破坏（工具仍工作）
3. 用 node 临时脚本直接调 `readUsageSnapshot()` 验证返回对象，并确认 `usage` remote 的 JSON 安全化没有 undefined（可以手写一个小断言：递归检查 key 值为 undefined 即失败）
4. 用 `renderToStaticMarkup` 渲染 UsageBar（传入一份样本 UsageView：normal 态 + 一个 scoped Fable 专项），确认进度条百分比/文案/徽标渲染正确；再传 blocked 态样本确认红色徽标
5. 不破坏：listJobs/readEvents/readOutput/cancel、任务列表、输出区、取消路径
6. CHANGELOG 顶部加 `## 0.3.3`（英文，一句）；README 面板描述提一句额度栏

## 5. 约束

- 不改 jobs seam；不 fork/patch @deepseek-ai；不动 cordis.patch.yml；不新增依赖（React 18 + seed 白名单）
- 额度栏**不得**阻塞任务列表/输出的性能（渲染轻量、轮询低频）
- 完成输出：改动文件清单、构建结果、UsageBar 渲染验证结论、usage remote JSON 安全断言结论
