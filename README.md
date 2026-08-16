[![dsh-plugin](https://img.shields.io/badge/dsh--plugin-blue?logo=github)](https://github.com/topics/dsh-plugin) [![npm](https://img.shields.io/npm/v/dsh-claude-code)](https://www.npmjs.com/package/dsh-claude-code) [![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

# dsh-claude-code

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 工具插件：把**自包含的编码子任务**委派给**本地 Claude Code 订阅**执行，结果回传给 DSH。DSH 是 leader，Claude Code 是 worker。

- 走官方 [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)，驱动 `claude` CLI，**不提取任何 OAuth token**，合规使用订阅。
- 内置 **claude-code-delegation skill**（Leader-Worker 委派 SOP），装好即出现在技能目录。
- 支持 **resume** 跨轮记忆：把上次返回的 `sessionId` 传回，Claude Code 会记住之前的上下文，适合多轮迭代。

## 安装（用户侧）

```bash
# 1. 装进 DSH profile
cd ~/.dsh/profiles
npm install dsh-claude-code
# 或者本地开发：npm link dsh-claude-code

# 2. 接线：在 ~/.dsh/profiles/<你的profile>/cordis.patch.yml 里加上
# - insert:
#     - id: claude-code
#       name: 'dsh-claude-code'

# 3. 重启 dsh
```

接线示例（带配置）：

```yaml
- insert:
    - id: claude-code
      name: 'dsh-claude-code'
      config:
        model: sonnet                # sonnet | opus | haiku | 完整 id
        permissionMode: acceptEdits  # default | acceptEdits | bypassPermissions | plan | dontAsk
        maxTurns: 100
        timeoutMs: 600000
        # 可选：claude 可执行文件路径（SDK 会自动从 PATH 探测，一般不用配）
        # pathToClaudeCodeExecutable: /path/to/claude
```

## 配置项

| 字段 | 默认 | 说明 |
|---|---|---|
| `model` | `sonnet` | Claude 模型别名或完整 id |
| `permissionMode` | `acceptEdits` | Claude Code 权限模式。`acceptEdits` 自动放行文件编辑；`bypassPermissions` 完全免确认（需信任） |
| `maxTurns` | `100` | 每次任务 Claude Code 最多跑多少轮 |
| `timeoutMs` | `600000` | 单次调用的协作超时 |
| `cwd` | DSH cwd | Claude Code 工作目录 |
| `allowedTools` | 未设 | 允许的 Claude Code 内置工具名列表 |
| `pathToClaudeCodeExecutable` | 自动 | `claude` 可执行文件路径 |

## 工具参数（模型可见）

| 参数 | 说明 |
|---|---|
| `task`（必填） | 自包含任务描述（目标、文件、约束、验收） |
| `cwd` / `model` / `permissionMode` / `maxTurns` / `allowedTools` | 覆盖插件配置 |
| `resume` | 传上次返回的 `sessionId`，续接那个 Claude Code 会话（记住之前的上下文） |

返回：最终结果文本 + `sessionId` + token 用量 + 费用 + 用到的工具。

## 用法示例

```json
// 第一轮
{ "task": "修复 src/parser.ts 里 parse() 对空输入的崩溃，并加一个单元测试", "cwd": "/path/to/repo" }
// → { "ok": true, "output": "…", "sessionId": "abc-123" }

// 第二轮（迭代同一任务，带记忆）
{ "task": "上一步的修复里你漏了边界情况 X，补上并重跑测试", "resume": "abc-123" }
```

## 合规说明

- ✅ 走 Claude Code 官方 CLI / Agent SDK，符合 Anthropic 认证与订阅政策。
- ❌ 本插件**不是**「把 Claude 当 DSH 的裸模型适配器」——那需要提取 Claude Code 的 OAuth token 直连 api.anthropic.com，已被 Anthropic 明令禁止、会导致封号。

## 开发

```bash
npm install --legacy-peer-deps
npm run build       # tsc → lib/
npm run typecheck
```

## 发布

```bash
npm login
npm publish         # publishConfig.access 已设 public
```

发布后建议：GitHub 建仓库并给仓库打 **dsh-plugin** topic，即可出现在 github.com/topics/dsh-plugin。

## 注意

- 每次调用约 10 秒起步、按订阅计费（小任务实测约 0.1~0.2 美元），只适合"完整子任务"。
- Claude Code 自己执行工具，DSH 的沙箱/权限不套在它的工具调用上——请把 `cwd` 与 `permissionMode` 收敛到信任范围。
