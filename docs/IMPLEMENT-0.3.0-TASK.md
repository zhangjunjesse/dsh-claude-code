# IMPLEMENT-0.3.0：dsh-claude-code 0.3.0 实现任务书

你是 Claude Code，在 dsh-claude-code 插件仓库实现 0.3.0。本文件是你的任务书。**先读完本文件与所有引用的设计文档，再动手。**

## 0. 目标

把插件从 0.2.0 升级到 0.3.0，交付三块：

1. **P0（已完成，勿重复）**：后台任务 `done.detail` 富化为 `$0.13 · 12 turns · 3m20s` —— 已在 src/index.ts 改好并构建通过。不要回退它。
2. **P1（主体）**：Claude Code 监控面板 —— 会话头新增第三个视图 tab「Claude Code」（在 对话/轨迹 右边），点击后整个会话体显示监控面板（任务列表 + 实时输出窗口 + 取消）。
3. **M1（额度工具）**：新增 `claude_code_usage` 工具，读取本机 Claude 订阅额度（5h/7d 用量、重置时间、订阅类型、limits），输出中文 render。

## 1. 必读文件（按顺序）

1. **设计文档（权威）**：
   - `docs/UI-DESIGN-0.3.0.md` —— P1 完整设计（可行性/UI 结构/数据流/组件结构/打包/里程碑/风险），**照它实现**
   - `docs/UI-DESIGN-0.3.0-popover.md` —— 弹层方案（备选，P1 不用实现，只读了解）
   - `docs/USAGE-DESIGN-0.3.0.md` —— M1 额度工具设计，照 §3.1/§4 实现
2. **现有代码**：`src/index.ts`（0.2.0 全文）、`package.json`、`tsconfig.json`、`README.md`
3. **参考实现（本机）**：
   - `C:\Users\Administrator\.dsh\profiles\desktop\node_modules\dsh-better-sidebar\`（TS 源码在 src/，打包配置在 package.json；client bundle 契约看 lib/client.js 开头）
   - DSH 包源码：`C:\Users\Administrator\AppData\Local\Programs\DSH Desktop\resources\app.asar.unpacked\node_modules\@deepseek-ai\`（dsh-client-modules、dsh-client-ui-conversation、dsh-client-ui-jobs、dsh-client-web-react、dsh-client-ui-slots、dsh-client-connection、dsh-api-gateway、dsh-typert-protocol、dsh-client-runtime —— 设计文档已给出行号，照着核对）
   - 设计文档引用路径缩写：`APP\` = 上面的 @deepseek-ai 目录；`PROF\` = `C:\Users\Administrator\.dsh\profiles\desktop\node_modules\`

## 2. P1 实现要求（严格按 UI-DESIGN-0.3.0.md）

### 2.1 Host 端（node 半边）

- 新增 `src/tracker.ts`：`JobTracker`（Map<jobId, TrackedJob>），TrackedJob 字段与 read/cancelFromUi 语义照设计 §4.1。
- 新增 `src/remote.ts`：`ClaudeCodeRemote extends TypertRemoteService(ctx, 'claudeCode')`，三个 `@Remote` 方法：`listJobs(sessionId)` / `readOutput(sessionId, jobId, fromOffset)` / `cancel(sessionId, jobId)`，全部校验 ownerSessionId。参照 `APP\dsh-goal\lib\index.js` 的 TypertRemoteService 写法核对构造参数。
- 改造 `src/index.ts`：
  - `createBuffer`（现有 full 缓冲）加 `absoluteBase` 记账与 `read(fromOffset)`（设计 §4.1 集成点 2）
  - `startBackgroundJob` 在 `jobs.start` 返回 jobId 后登记 tracker，`done` 结算回填元数据（sessionId/costUsd/numTurns/durationMs/output/failureDetail）
  - UI 取消 `cancelFromUi()` 复用现有 cancel 闭包 → done 以 `{status:'killed', detail:'cancelled by user (UI)'}` 收尾（坑 B 绕行）
  - 保留策略：每会话最近 20 条，不持久化
- 不需要改动 `ctx.jobs` seam 本身（不 fork、不 patch）。

### 2.2 Client 端（web 半边）

- 新增 `src/client/index.ts`（入口：`exports.inject = ['slots','connection']`；`ctx.slots.inject('conversation.view', () => ctx.slots.register({name:'conversation.view', id:'claude-code', order:100, label:()=>'Claude Code'}, ClaudeCodeView))`）
- `src/client/ClaudeCodeView.tsx`：左列表 + 右窗口布局，根元素带 `data-conversation-composer-overlay=""`；任务列表数据源 `useSessions(s => s.jobsBySession[sessionId]) ?? []` 过滤 kind==='claude-code'；排序照抄官方（running 升序在前、终态新→旧）；模块级 per-session 缓存（切 tab 回来续读）
- `src/client/OutputView.tsx`：实时输出（等宽、pre-wrap、自动滚动可暂停、`[tool]` 行高亮、500KB/2000 行上限）
- `src/client/api.ts`：`ctx.connection.rpc.call('/api', 'claudeCode/<method>', { args: {...} }, signal)` 薄封装（设计 §3.2 主方案；返回 `{ok,value}|{ok,error}` 自校验）
- `src/client/locales.ts`：zh/en 词条
- 只 require seed 白名单模块（react、react/jsx-runtime、@deepseek-ai/dsh-client-ui-primitives）；React 18 语法；其余依赖 vendor
- 轮询：仅 tab 激活且选中任务 running 时每 1s 拉 `readOutput` 增量；终态补拉一次

### 2.3 打包与接线（照设计 §5）

- `package.json`：
  - `exports` 加 `"./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" }`
  - 加 `"dsh": { "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-runtime", "@deepseek-ai/dsh-client-connection", "@deepseek-ai/dsh-client-ui-conversation"] } }`（bundle.patch 保留）
  - `files` 加 `lib/client.js`
  - peerDeps 加 `react ^18.2.0`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-typert-protocol`（版本对齐 better-sidebar 或现有 @deepseek-ai 包）；devDeps 加 `@types/react ~18.3.1`、bundler（esbuild 或 tsdown，自选并说明理由）
- 构建：node 半边维持 tsc；client 半边新增 bundler 步骤（入口 src/client/index.ts → lib/client.js，**CJS、经典 script、外层包装 `window.__ModuleLoader__.load({ id: "dsh-claude-code", factory: (require) => {...} })`**，id 必须精确等于包名，externals = seed 白名单）。`npm run build` 串两步 + 产物存在性断言（lib/client.js 缺失会 MissingClientBundleError）
- `cordis.patch.yml` 不变
- 需要的话允许 `npm install --legacy-peer-deps -D <bundler> @types/react` 安装 devDeps（不要动已装依赖）

## 3. M1 额度工具（严格按 USAGE-DESIGN-0.3.0.md）

- 新增 `src/usage.ts`：`readUsageSnapshot()`（读 `~/.claude.json` 的 cachedUsageUtilization + oauthAccount；`claude auth status --json` 兜底 subscriptionType；全程可选链容错；计算 ageMinutes/maybeStale/advice；**绝不读 .credentials.json、绝不输出 token/email 等敏感字段**）
- `src/index.ts` 注册 `claude_code_usage` 工具（defineTool）：参数 `staleAfterMinutes`（默认 30）、`forceRefresh`（MVP 占位，回"暂不支持"警告）；输出照设计 §2.2 契约；render 中文文案照 §3.1 示例；错误分支照 §3.1 表格

## 4. 验收标准（全部要满足）

1. `npm run typecheck` 0 错误；`npm run build` 成功，产出 `lib/index.js`（node）+ `lib/client.js`（client，检查 id 为 "dsh-claude-code"）
2. `lib/client.js` 顶层是 `window.__ModuleLoader__.load({ id: "dsh-claude-code", factory: ... })`，且 factory 内 require 只有 seed 白名单 + 自身模块
3. P0 的 detail 富化仍在（`$xx.xx · N turns · NmNs`）
4. `claude_code_usage` 工具注册、输出字段齐全（ok/loggedIn/subscription/fiveHour/sevenDay/limits/spend/cache/advice/warnings），敏感字段不出现
5. 不改动 node 半边对 jobs seam 的既有调用（仍是 start 为主，无 read/kill）
6. 无遗留调试代码；README 配置表/工具表补充 claude_code_usage 与新能力（简要）
7. CHANGELOG 顶部加 `## 0.3.0`（英文，列 P0/P1/M1）

## 5. 约束

- 只改本仓库；不 fork/patch 任何 @deepseek-ai 包；不动 cordis.patch.yml 的现有内容
- 中文注释/文案保持 UTF-8
- 完成输出：改动文件清单、构建结果摘要、lib/client.js 的 id 确认、claude_code_usage 输出样例（本机实际调用一次看返回，若 claude 未登录则说明错误分支表现）
- 如果 TypertRemoteService 或 client runtime 的某 API 与设计文档预期不符（实现时核对源码为准），记录差异并给出你的替代方案
