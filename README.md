[![dsh-plugin](https://img.shields.io/badge/dsh--plugin-blue?logo=github)](https://github.com/topics/dsh-plugin) [![npm](https://img.shields.io/npm/v/dsh-claude-code)](https://www.npmjs.com/package/dsh-claude-code) [![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

# dsh-claude-code

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 工具插件：把**自包含的编码子任务**委派给**本地 Claude Code 订阅**执行，结果回传给 DSH。DSH 是 leader，Claude Code 是 worker。

- 走官方 [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)，驱动 `claude` CLI，**不提取任何 OAuth token**，合规使用订阅。
- 内置 **claude-code-delegation skill**（Leader-Worker 委派 SOP），装好即出现在技能目录。
- 支持 **resume** 跨轮记忆：把上次返回的 `sessionId` 传回，Claude Code 会记住之前的上下文，适合多轮迭代。
- 支持 **后台异步任务**：`run_in_background: true` 立即返回 `jobId`，用 DSH 自带的 `job_output` 流式读取实时输出。
- 内置 **Claude Code 监控面板**：会话头「对话 / 轨迹」右边多一个 **Claude Code** 标签页，任务列表 + 终端式实时输出 + 一键取消（Web 端）。
- 内置 **claude_code_usage 工具**：读本机 Claude 订阅额度（5 小时 / 7 天窗口、重置时间、订阅档位），派活前先看一眼。
- 支持 **结构化输出**（`outputSchema`）、**成本上限**（`maxBudgetUsd`）、**追加系统提示**（`appendSystemPrompt`）与**自定义 subagents**。

## 安装（用户侧）

```bash
# 方式一（最简单，自动接线）：通过 dsh 插件命令安装
dsh plugin --profile web add dsh-claude-code

# 方式二：手动装进 profile
cd ~/.dsh/profiles
npm install dsh-claude-code
# 然后在 ~/.dsh/profiles/<你的profile>/cordis.patch.yml 里加上：
# - insert:
#     - id: claude-code
#       name: 'dsh-claude-code'
```

装完重启 dsh。插件自带 `cordis.patch.yml`（`dsh.bundle` manifest），`dsh plugin add` 会用它自动接线。

接线示例（带配置）：

```yaml
- insert:
    - id: claude-code
      name: 'dsh-claude-code'
      config:
        model: sonnet                # sonnet | opus | haiku | 完整 id
        permissionMode: acceptEdits  # default | acceptEdits | bypassPermissions | plan | dontAsk | auto
        maxTurns: 100
        timeoutMs: 600000
        # 可选：claude 可执行文件路径（SDK 会自动从 PATH 探测，一般不用配）
        # pathToClaudeCodeExecutable: /path/to/claude
        # 可选：成本上限与追加指令
        # maxBudgetUsd: 2
        # appendSystemPrompt: 始终用中文写提交信息；不要碰 lib/ 目录。
        # 可选：出网 IP 是数据中心 IP 时走本机代理（Anthropic 403 的解法）
        # proxy: http://127.0.0.1:7897
        # 可选：自定义 subagents（Claude Code 内可被 Agent 工具调用）
        # subagents:
        #   reviewer:
        #     description: 复核刚写完的补丁，找出 bug 与风格问题
        #     prompt: 你是严格的代码复核者，只报真实问题，按严重度排序。
        #     tools: [Read, Grep, Glob]
        #     model: sonnet
```

## 配置项

| 字段 | 默认 | 说明 |
|---|---|---|
| `model` | `sonnet` | Claude 模型别名或完整 id |
| `permissionMode` | `acceptEdits` | Claude Code 权限模式。`acceptEdits` 自动放行文件编辑；`auto` 由分类器自动批/拒；`bypassPermissions` 完全免确认（需信任，且要开下面的开关） |
| `maxTurns` | `100` | 每次任务 Claude Code 最多跑多少轮 |
| `timeoutMs` | `600000` | 单次调用的协作超时（后台任务同样受它约束） |
| `cwd` | DSH cwd | Claude Code 工作目录 |
| `allowedTools` | 未设 | 允许的 Claude Code 内置工具名列表 |
| `pathToClaudeCodeExecutable` | 自动 | `claude` 可执行文件路径 |
| `effort` | `high` | 思考强度：`low`/`medium`/`high`/`xhigh`/`max` |
| `maxThinkingTokens` | 未设 | 思考 token 预算上限（旧参数，建议改用 `thinkingMode`） |
| `thinkingMode` | 未设 | 思考模式：`adaptive`（Claude 自己决定思考量）或 `disabled`（关闭扩展思考）；不设即用 SDK 默认 |
| `maxBudgetUsd` | 未设 | 单次任务的美元成本上限，达到即停 |
| `appendSystemPrompt` | 未设 | 追加到 Claude Code 默认系统提示后面的额外指令 |
| `allowDangerouslySkipPermissions` | `false` | 有意的安全开关；不开时 `permissionMode: bypassPermissions` 会被直接拒绝 |
| `proxy` | 未设 | 给 claude 子进程设置的 HTTP 代理（如 `http://127.0.0.1:7897`），写入其 `HTTPS_PROXY`/`HTTP_PROXY`/`ALL_PROXY`；出网 IP 是数据中心 IP、Anthropic 返回 403 时用它 |
| `subagents` | 未设 | 自定义 subagent 表：名称 → `{ description, prompt, tools?, disallowedTools?, model?, maxTurns?, initialPrompt?, background? }`，注册到 Claude Code 的 Agent 工具 |

## 工具一览（模型可见）

| 工具 | 说明 |
|---|---|
| `claude_code` | 把一个自包含编码任务委派给本机 Claude Code；前台返回最终文本，`run_in_background: true` 返回 `jobId` |
| `claude_code_usage` | 读本机 Claude 订阅额度（5 小时 / 7 天窗口百分比、重置时间、各 limit 严重度、订阅档位），纯本地读取、零 token、毫秒级 |

### `claude_code` 参数

| 参数 | 说明 |
|---|---|
| `task`（必填） | 自包含任务描述（目标、文件、约束、验收） |
| `cwd` / `model` / `permissionMode` / `maxTurns` / `allowedTools` / `effort` / `maxThinkingTokens` | 覆盖插件配置 |
| `resume` | 传上次返回的 `sessionId`，续接那个 Claude Code 会话（记住之前的上下文） |
| `run_in_background` | `true` = 转成 DSH 后台任务，立即返回 `{ kind: "background", jobId }` |
| `thinkingMode` | 本次调用的思考模式：`adaptive` / `disabled` |
| `maxBudgetUsd` | 本次调用的美元成本上限 |
| `appendSystemPrompt` | 本次调用追加到默认系统提示的额外指令 |
| `outputSchema` | JSON Schema 对象；给了就让 Claude Code 产出结构化结果，回到 `structuredOutput` |
| `proxy` | 本次调用用的 HTTP 代理（覆盖插件配置的 `proxy`） |

返回：最终结果文本 + `sessionId` + token 用量 + 费用 + 用到的工具 + `durationMs` / `numTurns`（有 `outputSchema` 时还有 `structuredOutput`）。

### `claude_code_usage` 参数

| 参数 | 说明 |
|---|---|
| `staleAfterMinutes` | 缓存超过多少分钟就标记 `maybeStale`，默认 30 |
| `forceRefresh` | 占位参数：主动刷新要真实烧一次额度，暂不支持，传了只会多一条 warning |

返回：`ok` / `loggedIn` / `subscription`（`type`、`rateLimitTier`、`billingType`）/ `fiveHour` / `sevenDay` / `limits[]` / `spend` / `extraUsage` / `cache`（`fetchedAt`、`ageMinutes`、`maybeStale`）/ `advice`（`normal` / `caution` / `blocked` / `unknown`）/ `warnings[]`。

数据源是 `claude` CLI 自己写在 `~/.claude.json` 的 `cachedUsageUtilization` 缓存 + `claude auth status --json` 的登录态。**不读 `~/.claude/.credentials.json`，不直连 API，输出里不含邮箱 / 账号 uuid / token 等任何账号标识**。它是缓存：每次 `claude_code` 委派都会顺带刷新它，所以刚跑完一个任务时最新鲜；超过 `staleAfterMinutes` 会如实标注"N 分钟前的缓存"。CLI 升级改结构时字段会降级成 `null` 并给 warning，不会报错。

## 用法示例

```json
// 第一轮
{ "task": "修复 src/parser.ts 里 parse() 对空输入的崩溃，并加一个单元测试", "cwd": "/path/to/repo" }
// → { "ok": true, "output": "…", "sessionId": "abc-123" }

// 第二轮（迭代同一任务，带记忆）
{ "task": "上一步的修复里你漏了边界情况 X，补上并重跑测试", "resume": "abc-123" }
```

## 后台异步任务

长任务不必阻塞当前这轮对话：传 `run_in_background: true`，工具立刻返回 `jobId`，任务在 DSH 的后台任务系统里跑。

```json
// 1) 派后台任务
{ "task": "把 src/ 全量迁移到新的 logger API，跑通 npm run build", "run_in_background": true }
// → { "kind": "background", "jobId": "claude-code-1" }

// 2) 增量读实时输出（每次只返回上次之后的新内容）
job_output { "jobId": "claude-code-1" }

// 3) 看在跑的任务 / 取消
job_list {}
job_kill { "jobId": "claude-code-1" }
```

- 实时输出来自 SDK 的 `includePartialMessages`，包含 Claude Code 的增量文本和 `[tool] Name` 调用标记。
- 任务结束时 DSH 自动推送完成通知，不用轮询；结束状态为 `completed` / `failed` / `killed`。
- 后台任务同样受 `timeoutMs` 约束，超时自动中止并以 `failed` 收尾（已产生的实时输出会保留）。
- `job_output` / `job_list` / `job_kill` 与完成通知由 DSH 的 `dsh-tool-jobs` 提供；没装它时后台模式会直接报 `background jobs unavailable: load @deepseek-ai/dsh-tool-jobs`。

## Claude Code 监控面板（Web 端）

装好后重启 DSH，会话顶部「对话 / 轨迹」右边会多一个 **Claude Code** 标签页，点开整个会话体变成监控面板：

- **左栏任务列表**：本会话的全部 `claude-code` 委派，运行中在前（按开始时间），已结束按新到旧；状态徽标 + 耗时实时走字。状态由 DSH 自带的任务推送驱动，不轮询。
- **右栏 Claude Code 窗口**：任务头（label / jobId / Claude 会话 id）+ 统计条（轮数 / 费用 / 耗时）+ 终端式实时输出（等宽、`[tool] Xxx` 行高亮、贴底自动滚动、上滚即暂停并给「↓ 回到底部」）。
- **操作**：取消（二次确认）、复制输出、复制 Claude 会话 id（可直接当 `resume` 用）。
- 实时输出只在「面板打开 + 选中任务还在跑」时每秒拉一次增量，任务进终态后补拉一次收尾。
- 面板的读取走**绝对 offset**，和模型侧 `job_output` 的游标完全独立——你在面板里看输出不会偷走模型的字节。面板取消走插件自己的中止通道，任务照常以 `killed` 结算，**模型仍然会收到完成通知**。
- 任务只存在于当前 DSH 进程内（每会话保留最近 20 条），重启后列表为空；历史结果看对话里的工具卡片。
- 标签页在 tab 条里的位置由插件加载顺序决定（不是 `order`），一般就在「轨迹」右边。
- 给已装好的插件补上这个 Web 半边后**必须重启 DSH**：包元数据的"非 client 包"判定会被永久缓存。

## 错误诊断

调用前会做一次同步预检，常见问题给的是可直接照做的提示：

| 现象 | 处理 |
|---|---|
| `claude executable not found` | 本机没装 CLI：`npm install -g @anthropic-ai/claude-code`；或把 `pathToClaudeCodeExecutable` 指到正确路径 |
| `cwd does not exist or is not a directory` | `cwd` 写错或目录不存在，改成存在的绝对路径 |
| 认证失败 | 在终端手动跑一次 `claude` 完成登录，再回来调用 |
| 计费错误 | 检查 Claude 订阅状态 |
| 限流 / 过载 | 稍后重试；必要时降 `effort` 或拆小任务 |
| 403（出网 IP 是数据中心 IP） | 在插件配置里设 `proxy`（如 `http://127.0.0.1:7897`，指向本机 Clash 等代理），或给 **DSH 进程**设置 `HTTPS_PROXY` / `HTTP_PROXY` 后重启 dsh 再调用 |
| `bypassPermissions` 被拒 | 这是有意的安全开关：在插件配置里显式设 `allowDangerouslySkipPermissions: true`，或改用 `acceptEdits` / `auto` |
| 达到 `maxBudgetUsd` | 调高预算或缩小任务范围 |
| `resume` 的会话已被清理 | 去掉 `resume` 重新发起一次 |

## 合规说明

- ✅ 走 Claude Code 官方 CLI / Agent SDK，符合 Anthropic 认证与订阅政策。
- ❌ 本插件**不是**「把 Claude 当 DSH 的裸模型适配器」——那需要提取 Claude Code 的 OAuth token 直连 api.anthropic.com，已被 Anthropic 明令禁止、会导致封号。

## 开发

```bash
npm install --legacy-peer-deps
npm run build       # node 半边 tsc → lib/，client 半边 esbuild → lib/client.js，再断言产物齐全
npm run typecheck   # 两个 tsconfig 都查（node + client）
```

两个半边：

| 半边 | 入口 | 产物 | 构建 |
|---|---|---|---|
| node（Host） | `src/index.ts`（+ `tracker.ts` / `remote.ts` / `usage.ts`） | `lib/*.js` + `lib/types/**` | `tsc -p tsconfig.json` |
| client（Web） | `src/client/index.ts` | `lib/client.js`（单文件 CJS，外层包 `window.__ModuleLoader__.load({ id: "dsh-claude-code", … })`） | `tsc -p tsconfig.client.json`（只出 d.ts）+ `scripts/build-client.mjs`（esbuild） |

client bundle 只允许 `require` DSH shell 的 seed 白名单（`react`、`react/jsx-runtime`、`@deepseek-ai/dsh-client-ui-primitives` 等），构建脚本会断言这一点，其余依赖必须打进 bundle。

## 发布

```bash
npm login
npm publish         # publishConfig.access 已设 public
```

发布后建议：GitHub 建仓库并给仓库打 **dsh-plugin** topic，即可出现在 github.com/topics/dsh-plugin。

## 注意

- 每次调用约 10 秒起步、按订阅计费（小任务实测约 0.1~0.2 美元），只适合"完整子任务"。
- Claude Code 自己执行工具，DSH 的沙箱/权限不套在它的工具调用上——请把 `cwd` 与 `permissionMode` 收敛到信任范围。
