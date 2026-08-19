# dsh-claude-code 0.2.0 开发规格

本文档是给 Claude Code 的完整任务书：把 `dsh-claude-code` 从 0.1.2 升级到 0.2.0。
实现、构建、自检全部由你（Claude Code）完成；只改本仓库内文件。

## 1. 任务概述

重写 `src/index.ts`，实现四个能力块（缺一不可）：

1. **后台异步任务**：新增 `run_in_background: true` 参数，工具立即返回 `{ kind: "background", jobId }`，
   任务注册进 DSH 的 `ctx.jobs` 后台任务系统（复用 DSH 已有的 `job_output` / `job_list` / `job_kill` 工具与完成通知）。
2. **流式输出**：后台任务执行期间，Claude Code 的实时输出可通过 `job_output` 增量读取（`readOutput` 钩子）。
3. **错误诊断增强**：claude 可执行文件缺失、cwd 不存在、`bypassPermissions` 缺 `allowDangerouslySkipPermissions`、
   认证失败、计费错误、限流等常见失败给出明确、可操作的中文/英文错误信息。
4. **SDK 新能力**：接入 `@anthropic-ai/claude-agent-sdk`（已装 0.3.233）的
   `appendSystemPrompt`、`thinking` 模式、`maxBudgetUsd`、`outputFormat`（JSON Schema 结构化输出）、
   `agents`（自定义 subagents）、`permissionMode: 'auto'`、`allowDangerouslySkipPermissions`。

兼容性：保留全部现有参数与行为（`task` / `cwd` / `model` / `permissionMode` / `maxTurns` / `allowedTools` /
`resume` / `effort` / `maxThinkingTokens` / `timeoutMs` / `pathToClaudeCodeExecutable`），升级不破坏旧调用。

## 2. 已核实的关键 API（不要重新调研，直接照用；源代码在本机 node_modules 里可查证）

### 2.1 Claude Agent SDK（`@anthropic-ai/claude-agent-sdk@0.3.233`）

- 入口：`import { query } from '@anthropic-ai/claude-agent-sdk'`；
  调用 `query({ prompt, options })`，返回 async iterable 消息流。
- `Options` 关键字段（见 `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`）：
  - `cwd` / `model` / `maxTurns` / `allowedTools` / `resume` / `effort`（'low'|'medium'|'high'|'xhigh'|'max'）
  - `pathToClaudeCodeExecutable`
  - `permissionMode`：`'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto'`
    （**`'auto'` 是新增模式**；`bypassPermissions` 必须同时设 `allowDangerouslySkipPermissions: true`，否则 SDK 报错）
  - `maxThinkingTokens`（已废弃，保留兼容）与 `thinking`：
    `{ type: 'adaptive' }` | `{ type: 'disabled' }` | `{ type: 'enabled', budgetTokens: number }`
  - `maxBudgetUsd`：美元预算上限，超限返回 `error_max_budget_usd` 结果
  - `systemPrompt`：可用 `{ type: 'preset', preset: 'claude_code', append: '<文本>' }` 在默认系统提示后追加指令
  - `agents`: `Record<string, AgentDefinition>`，定义可由 Agent 工具调用的自定义 subagent；
    `AgentDefinition` 可序列化字段：`description`(必填)、`prompt`(必填)、`tools?`、`disallowedTools?`、
    `model?`、`maxTurns?`、`initialPrompt?`、`background?`、`skills?`
  - `outputFormat`: `{ type: 'json_schema', schema: Record<string, unknown> }`（结构化输出）
  - `includePartialMessages: true` → 消息流里出现 `type: 'stream_event'` 消息，实时增量文本
  - `env`: 需 `{ ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: 'dsh-claude-code/0.2.0' }`
  - `abortController`: 取消任务
- 消息类型（只处理需要的）：
  - `{ type: 'assistant', session_id, message: { content: [{ type: 'text', text } | { type: 'tool_use', name }] }, error? }`
  - `{ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } }`
  - `{ type: 'result', session_id, subtype: 'success' | <error subtype>, result?, total_cost_usd?,
     usage: { input_tokens, output_tokens }?, num_turns?, duration_ms?, structured_output?, error? }`
  - 成功结果字段：`result`(最终文本)、`total_cost_usd`、`usage`、`num_turns`、`duration_ms`、`structured_output`

### 2.2 DSH 后台任务（`ctx.jobs`，本机 DSH 已装 `dsh-jobs` + `dsh-jobs-local` + `dsh-tool-jobs`）

- 插件通过 `ctx.get('jobs')` 读取（可选服务，未装时后台模式给出清晰错误）。
- `jobs.start({ kind, label, owner?, run })` → 返回 `jobId`（形如 `claude-code-N`）。
  - `kind`: `'claude-code'`；`label`: 简短任务描述（截断到 ~60 字符）。
  - `owner`: `exec.agent`（执行上下文的 agent，其 `.id` 即会话 id，DSH 用它做访问隔离）。
  - `run()` 必须同步返回钩子对象：`{ cancel: () => void, done: Promise<Outcome>, readOutput?: () => string }`
  - `Outcome`: `{ status: 'completed' | 'failed' | 'killed', detail?: string, output?: string }`
  - `readOutput()` 返回**自上次读取以来的增量文本**（流式语义，配合 `job_output` 的 delta 展示）。
- 工具在后台模式下返回 `{ kind: 'background', jobId }`（DSH 工具约定：pwsh/bash 的 `run_in_background` 同款形状；
  工具自己的 `output.render` 要处理该形状并渲染成 "started background job <jobId>…"）。
- 完成通知、`job_output`/`job_list`/`job_kill` 由 DSH 已有的 `tool-jobs` 插件提供，本插件**不要重复实现**。
- 取消：`job_kill` → `cancel()` → 内部 `AbortController.abort()` → `done` 以 `{ status: 'killed', detail }` 收尾。
- 超时：后台任务同样受 `timeoutMs` 约束，超时自动 `abort`，`done` 以 `{ status: 'failed', detail: 'timed out after Nms' }` 收尾。

### 2.3 dsh-tools（`defineTool`，DSH 已装 0.1.0-rc.6）

- `defineTool({ name, description, parameters, output, execute, presentCall?, timeoutMs? })`。
- `parameters` 每个属性：`{ type, required?, description?, enum?, items? }`；未约束的 `{ type: 'json', description }` 表示任意 JSON 值。
- `execute(args, exec)`：`exec.signal` 是 AbortSignal（前台模式取消）；`exec.agent` 是当前 agent。
  前台模式用 `exec.signal` 转发到内部 `AbortController`（现有代码已有该模式，保留）。
- `output.schema`：DSH 强校验的 JSON Schema 子集（支持 type/properties/required/additionalProperties/items/enum/const/oneOf + 注解）。
- `output.render(args, value)`：返回 `[{ type: 'text', text }]`，决定模型看到的工具结果文本。
- `presentCall(args)`：工具卡片；返回 `{ card: 'generic', title, kind, rawInput }`。

## 3. 新参数与输出契约

### 3.1 工具参数（`claude_code` 的参数 schema，全部可选除 `task`）

```
task                string   必填，自包含任务描述
cwd                 string   工作目录（默认：插件配置 cwd ?? DSH 进程 cwd）
model               string   模型别名/id 覆盖
permissionMode      enum ['default','acceptEdits','bypassPermissions','plan','dontAsk','auto']
maxTurns            integer  覆盖最大轮数
allowedTools        array<string>
resume              string   上次返回的 sessionId，续接会话
effort              enum ['low','medium','high','xhigh','max']
maxThinkingTokens   integer  （兼容旧参数）
thinkingMode        enum ['adaptive','disabled']   （新：thinking 模式；默认不传，保留 SDK 默认）
maxBudgetUsd        number   （新：美元预算上限）
appendSystemPrompt  string   （新：追加到 Claude Code 默认系统提示的指令）
outputSchema        json     （新：JSON Schema 对象 → outputFormat 结构化输出；返回 structuredOutput）
run_in_background   boolean  （新：true = 后台任务，立即返回 jobId）
```

### 3.2 输出对象（`output.schema`，additionalProperties: false，字段全部 optional）

```
前台模式：
{ ok: boolean, output: string, sessionId: string, costUsd: number, inputTokens: integer,
  outputTokens: integer, toolsUsed: array<string>, durationMs: integer, numTurns: integer,
  structuredOutput?: json }
后台模式：
{ kind: 'background', jobId: string }
```

### 3.3 插件配置（`Config`，新增字段；用 `@deepseek-ai/schemastery` 的 `z.object`）

```
（原有字段全部保留）
thinkingMode           可选 enum ['adaptive','disabled']
maxBudgetUsd           可选 number
appendSystemPrompt     可选 string
allowDangerouslySkipPermissions  可选 boolean，默认 false
subagents              可选 record：键为 subagent 名，值为对象
                       { description: string, prompt: string,
                         tools?: array<string>, disallowedTools?: array<string>,
                         model?: string, maxTurns?: number, initialPrompt?: string,
                         background?: boolean }
                       （schemastery 用 z.dict(z.object({...})) 表达 record）
```

## 4. 行为规范

### 4.1 前台模式（默认）
1. 执行预检（见 §5）。
2. 组装 SDK options：模型/权限/轮数/工具/思考/预算/systemPrompt(append)/agents(来自配置 subagents)/
   outputFormat(当且仅当给了 outputSchema)/includePartialMessages: true/env/abortController。
3. 迭代消息流：`assistant` 消息累积文本与 tool_use 名；`stream_event` 文本增量可选累积；
   `result` 成功取 `result`/`total_cost_usd`/`usage`/`num_turns`/`duration_ms`/`structured_output`。
4. `exec.signal` abort → `AbortController.abort()`；返回前移除监听。
5. 返回完整结果对象；渲染输出 = `output` + 一行统计（turns / cost / tokens）。

### 4.2 后台模式（`run_in_background: true`）
1. 预检（同步、快速；失败直接抛错，不建任务）。
2. `ctx.get('jobs')` 不存在 → 抛错：`background jobs unavailable: load @deepseek-ai/dsh-tool-jobs`。
3. `jobs.start` 注册任务；`run()` 内创建 `AbortController`、启动与前台相同的执行循环：
   - `cancel()`：`abort('cancelled')`（同时清超时定时器）。
   - `done`：成功 → `{ status: 'completed', detail: 'turns: N, duration: Nms', output: 最终文本 }`；
     失败 → `{ status: 'failed', detail: 友好错误, output: 已累积的实时文本 }`；
     取消 → `{ status: 'killed', detail: 'cancelled' }`；
     超时 → `{ status: 'failed', detail: 'timed out after Nms', output: 累积文本 }`。
   - `readOutput()`：返回自上次读取起的增量文本（内部维护 lastReadIndex；累积缓冲设上限 ~500KB，超出截断并标注）。
4. 工具立即返回 `{ kind: 'background', jobId }`；render 渲染：
   `started background job <jobId>` + 提示（"use job_output to stream output, job_kill to cancel"）。

### 4.3 错误诊断（友好错误信息，前后台通用）
- claude 可执行文件找不到（`pathToClaudeCodeExecutable` 不存在，或 PATH 探测 `where claude`/`which claude` 无结果）：
  `claude executable not found — install it with: npm install -g @anthropic-ai/claude-code`
- `cwd` 不存在或不是目录：`cwd does not exist or is not a directory: <path>`
- `permissionMode === 'bypassPermissions'` 且配置未开 `allowDangerouslySkipPermissions`：
  配置错误，提示在插件配置里设 `allowDangerouslySkipPermissions: true`（明确这是有意的安全开关）。
- SDK 返回的错误（`assistant` 消息的 `error` 或 `result` 的失败 subtype / `error_max_budget_usd`）映射：
  - `authentication_failed` → Claude Code 认证失败：请先在终端运行一次 `claude` 完成登录
  - `billing_error` → 订阅计费问题：检查你的 Claude 订阅
  - `rate_limit` / `overloaded` → 暂时限流/过载：稍后重试
  - `model_not_found` → model 参数无效
  - `error_max_budget_usd` → 达到 maxBudgetUsd 上限
  - `resume` 失败（会话被清理）→ 提示去掉 resume 重新发起
  - 其他：透出 SDK 原始 message，前缀 `claude_code failed:`
- 预检用 `node:fs` 的 `existsSync`/`statSync` 与 `node:child_process` 的 `spawnSync`（插件运行在 DSH 的 Node 进程内，可用这些）。

## 5. 预检清单（同步、快速，失败即抛友好错误）
1. `cwd` 有效性（存在且为目录）。
2. claude 可执行文件：显式配置则检查路径存在；否则探测 PATH（win32: `where claude`，其他: `which claude`）。
3. `bypassPermissions` 与 `allowDangerouslySkipPermissions` 的一致性。

## 6. Skill 更新（`src/index.ts` 内嵌的 `claude-code-delegation` skill 文案）
补充：
- `run_in_background: true` 的用法：返回 jobId 后用 DSH 自带 `job_output` 增量读实时输出、`job_kill` 取消、
  完成时自动收到通知；适合长任务。
- 新参数：`maxBudgetUsd`（成本上限）、`appendSystemPrompt`（追加指令）、`thinkingMode`、`outputSchema`（结构化输出）。
- 配置 `subagents` 可在 Claude Code 内定义自定义 subagent（Agent 工具调用）。
- 网络提示：若本机出网 IP 是数据中心 IP 且 Anthropic 返回 403，给 DSH 进程设置
  `HTTPS_PROXY`/`HTTP_PROXY`（指向本机 Clash 等代理）后再调用本插件。

## 7. README.md 与 CHANGELOG.md 更新
- `CHANGELOG.md` 顶部新增 `## 0.2.0` 条目，列出上述新特性（英文）。
- `README.md`：
  - 配置表新增行：`thinkingMode`、`maxBudgetUsd`、`appendSystemPrompt`、`allowDangerouslySkipPermissions`、`subagents`。
  - 工具参数表新增：`run_in_background`、`thinkingMode`、`maxBudgetUsd`、`appendSystemPrompt`、`outputSchema`。
  - 新增"后台异步任务"小节：示例（`run_in_background: true` → `job_output` 流式读取 → 完成通知）。
  - 新增"错误诊断"小节：常见失败与处理（claude 未装 / 未登录 / 数据中心 IP 403 走代理 / bypassPermissions 开关）。
- 保持 README 现有结构风格与中文（文件为 UTF-8）。

## 8. 构建与验收（必须全部通过）
```
npm run typecheck   # tsc --noEmit，0 错误
npm run build       # tsc → lib/
```
- 验收标准：typecheck 与 build 零错误；`lib/index.js` 与 `lib/types/index.d.ts` 重新生成；
  实现覆盖 §1 四个能力块与 §4 行为规范；未修改 `node_modules`、未修改其他无关文件。
- 提交前自检：grep 确认新参数名在工具描述/参数 schema/README 中一致；无遗留调试代码。

## 9. 约束
- 只编辑：`src/index.ts`、`README.md`、`CHANGELOG.md`、`package.json`（版本号 `0.1.2` → `0.2.0`）。
- 不要动 `cordis.patch.yml`、`cordis.patch.example.yml`、`lib/`（build 会自动生成）、`node_modules/`。
- 全部代码用普通 JavaScript/TypeScript，DSH 插件环境无 JSX/装饰器。
- 完成后列出你改动的文件与验证命令输出摘要。
