import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { SkillRegistration } from '@deepseek-ai/dsh-skill'
import { query } from '@anthropic-ai/claude-agent-sdk'
import type { AgentDefinition, Options } from '@anthropic-ai/claude-agent-sdk'
import { existsSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

export const name = 'claude-code'
export const inject = ['tools', 'skills']

const CLIENT_APP = 'dsh-claude-code/0.2.0'

/** Cap for the live-output buffers kept per background job. */
const MAX_LIVE_BUFFER = 500_000

const PERMISSION_MODES = ['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk', 'auto'] as const
const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
const THINKING_MODES = ['adaptive', 'disabled'] as const

export interface SubagentConfig {
  description: string
  prompt: string
  tools?: string[]
  disallowedTools?: string[]
  model?: string
  maxTurns?: number
  initialPrompt?: string
  background?: boolean
}

export interface Config {
  model: string
  permissionMode: string
  maxTurns: number
  timeoutMs: number
  cwd?: string
  allowedTools?: string[]
  pathToClaudeCodeExecutable?: string
  effort?: string
  maxThinkingTokens?: number
  thinkingMode?: 'adaptive' | 'disabled'
  maxBudgetUsd?: number
  appendSystemPrompt?: string
  allowDangerouslySkipPermissions: boolean
  proxy?: string
  subagents?: Record<string, SubagentConfig>
}

export const Config: z<Config> = z.object({
  model: z.string().description('Claude model alias (sonnet/opus/haiku) or full id.').default('sonnet'),
  permissionMode: z.string()
    .description("Claude Code permission mode: default, acceptEdits, bypassPermissions, plan, dontAsk, or auto.")
    .default('acceptEdits'),
  maxTurns: z.number().description('Maximum Claude Code agentic turns per task.').default(100),
  timeoutMs: z.number().description('Cooperative timeout budget for one call (ms).').default(600000),
  cwd: z.string().description('Working directory for Claude Code; defaults to the DSH workspace cwd.'),
  allowedTools: z.array(z.string()).description('Claude Code built-in tools to allow.'),
  pathToClaudeCodeExecutable: z.string().description('Path to the claude executable; auto-detected when omitted.'),
  effort: z.string().description('Thinking effort: low, medium, high, xhigh, or max.').default('high'),
  maxThinkingTokens: z.number().description('Optional thinking token budget per task (deprecated; prefer thinkingMode).'),
  thinkingMode: z.union([...THINKING_MODES])
    .description('Thinking mode: adaptive (Claude decides) or disabled. Unset keeps the SDK default.'),
  maxBudgetUsd: z.number().description('Hard USD budget per task; the run stops once it is reached.'),
  appendSystemPrompt: z.string().description("Instructions appended to Claude Code's default system prompt."),
  allowDangerouslySkipPermissions: z.boolean()
    .description('Deliberate safety switch required before permissionMode bypassPermissions is accepted.')
    .default(false),
  proxy: z.string().description(
    'HTTP proxy for the claude subprocess (e.g. http://127.0.0.1:7897). ' +
    'Sets HTTPS_PROXY/HTTP_PROXY/ALL_PROXY for the spawned claude; useful when the machine outbound IP is a ' +
    'datacenter IP and Anthropic rejects requests (403) without a proxy. NO_PROXY keeps localhost direct.',
  ),
  subagents: z.dict(z.object({
    description: z.string().description('When Claude Code should invoke this subagent.').required(),
    prompt: z.string().description("The subagent's system prompt.").required(),
    tools: z.array(z.string()).description('Tools the subagent may use; inherits all tools when omitted.'),
    disallowedTools: z.array(z.string()).description('Tools explicitly denied to the subagent.'),
    model: z.string().description("Model alias for the subagent; inherits the main model when omitted."),
    maxTurns: z.number().description('Maximum agentic turns for the subagent.'),
    initialPrompt: z.string().description('Auto-submitted first user turn for the subagent.'),
    background: z.boolean().description('Run this subagent as a background task when invoked.'),
  })).description('Custom subagents exposed to Claude Code via its Agent tool, keyed by subagent name.'),
})

const DELEGATION_SKILL: SkillRegistration = {
  name: 'claude-code-delegation',
  description:
    'Leader-Worker 流程：把自包含的编码子任务（写/改插件、重构、修 bug 补测试）委派给本机 Claude Code 订阅执行并循环质检。任务需要 Claude Code 自己读文件、跑循环时用它。',
  whenToUse:
    '用户要求写/改代码且任务自包含、边界清晰（尤其"让 Claude 来写/修 XX"）；或维护 dsh-claude-code 插件本身时。',
  source: 'runtime' as const,
  content: [
    '# Claude Code 委派 SOP（Leader-Worker）',
    '',
    'DSH 是 leader，本机 Claude Code（订阅，走官方 Agent SDK，合规）是 worker。工具：claude_code。',
    '',
    '## 何时用 / 何时不用',
    '- 用：自包含、边界清晰的编码任务（写/改插件、重构、修 bug + 补测试、脚手架）；上下文能从文件系统获得（Claude Code 自带 Read/Edit/Bash/Grep/Glob）。',
    '- 不用：强依赖 DSH 会话历史或 DSH 生态（subagent/workflow/goal/todo）的任务，自己干。',
    '',
    '## 派活规范（任务文本必须包含）',
    '1. 目标：一句话说清要交付什么。',
    '2. 文件：相关文件绝对路径。派活前先 read/grep 摸清结构，把结论写进任务。',
    '3. 约束：构建/验证命令（npm run build、npx tsc）、禁止事项、风格要求。',
    '4. 验收：明确"做到什么算完成"。',
    '',
    '## 循环质检',
    '- 结果回来必须 review，并亲自跑构建/测试验证，不要直接采信。',
    '- 不满意就带着具体反馈再派一轮，写清上一轮哪里不对。',
    '',
    '## 多轮迭代（resume）',
    '- 调用返回的 sessionId 就是 Claude Code 的会话句柄。',
    '- 同一任务继续迭代时，把上次的 sessionId 作为 resume 参数传回，Claude Code 会记住它之前的上下文。',
    '- resume 失败（会话已被清理）时，去掉 resume 重新派。',
    '',
    '## 后台异步任务（run_in_background）',
    '- 长任务传 run_in_background: true，工具立刻返回 { kind: "background", jobId }，不占用当前这轮。',
    '- 用 DSH 自带的 job_output 增量读取 Claude Code 的实时输出（每次只给上次之后的新内容），job_list 看在跑的任务，job_kill 取消。',
    '- 任务结束时 DSH 会自动推送完成通知，不需要轮询。',
    '- 短任务（几十秒内）直接前台调用即可，前台会把最终文本一次性返回。',
    '',
    '## 参数覆盖',
    '- cwd（工作目录）、model（sonnet/opus/haiku）、permissionMode（default/acceptEdits/bypassPermissions/plan/dontAsk/auto，默认 acceptEdits）、maxTurns、effort（思考强度 low/medium/high/xhigh/max）、resume。',
    '- maxBudgetUsd：本次任务的美元成本上限，超了自动停。',
    '- appendSystemPrompt：追加到 Claude Code 默认系统提示后面的额外指令（约定风格、禁止事项）。',
    '- thinkingMode：adaptive（Claude 自己决定思考量）或 disabled（关闭扩展思考）；maxThinkingTokens 是旧参数，仍可用。',
    '- outputSchema：传一个 JSON Schema，Claude Code 按它产出结构化结果，回到 structuredOutput 字段。',
    '',
    '## 自定义 subagents',
    '- 插件配置里的 subagents（名称 → { description, prompt, tools?, model?, maxTurns? … }）会注册成 Claude Code 内可被 Agent 工具调用的子代理，适合固定的专项角色（如 reviewer、test-writer）。',
    '',
    '## 常见故障',
    '- "claude executable not found"：本机没装 CLI，npm install -g @anthropic-ai/claude-code。',
    '- 认证失败：在终端手动跑一次 claude 完成登录。',
    '- 403 / 出网 IP 是数据中心 IP：给插件配置设 proxy（如 http://127.0.0.1:7897），或给 DSH 进程设 HTTPS_PROXY / HTTP_PROXY（指向本机 Clash 等代理）后重启 dsh 再调用。',
    '- bypassPermissions 报错：这是有意的安全开关，需要在插件配置里显式设 allowDangerouslySkipPermissions: true。',
    '',
    '## 成本与延迟',
    '- 每次约 10 秒起步、按订阅计费（小任务实测约 0.1~0.2 美元）。',
    '- 琐碎小问不派；一个"完整子任务"才派。',
    '',
    '## 插件维护（改 dsh-claude-code 本身）',
    '- 改完源码：npm run build，再按安装方式重新部署（本地：cp -R 覆盖 profile node_modules 下的 dsh-claude-code），最后重启 dsh。',
    '- 其他用户安装：dsh plugin add dsh-claude-code（npm 包带 bundle manifest，自动接线）。',
  ].join("\n"),
}

const CLAUDE_MISSING =
  'claude executable not found — install it with: npm install -g @anthropic-ai/claude-code'

/** Positive PATH probes are cached; a negative result is re-probed so a later install is picked up. */
let claudeOnPath = false

function hasClaudeOnPath(): boolean {
  if (claudeOnPath) return true
  const probe = process.platform === 'win32' ? 'where' : 'which'
  try {
    const result = spawnSync(probe, ['claude'], { stdio: 'ignore', windowsHide: true })
    claudeOnPath = result.status === 0
  } catch {
    claudeOnPath = false
  }
  return claudeOnPath
}

/** Fast, synchronous checks that turn the common misconfigurations into actionable errors. */
function preflight(opts: {
  cwd: string
  pathToClaudeCodeExecutable?: string
  permissionMode: string
  allowDangerouslySkipPermissions: boolean
}) {
  let isDirectory = false
  try {
    isDirectory = statSync(opts.cwd).isDirectory()
  } catch {
    isDirectory = false
  }
  if (!isDirectory) throw new Error(`cwd does not exist or is not a directory: ${opts.cwd}`)

  if (opts.pathToClaudeCodeExecutable) {
    if (!existsSync(opts.pathToClaudeCodeExecutable)) {
      throw new Error(`${CLAUDE_MISSING} (configured pathToClaudeCodeExecutable does not exist: ${opts.pathToClaudeCodeExecutable})`)
    }
  } else if (!hasClaudeOnPath()) {
    throw new Error(CLAUDE_MISSING)
  }

  if (opts.permissionMode === 'bypassPermissions' && !opts.allowDangerouslySkipPermissions) {
    throw new Error(
      'permissionMode "bypassPermissions" 会让 Claude Code 跳过全部权限确认，属于有意的安全开关：' +
      '请在插件配置里显式设置 allowDangerouslySkipPermissions: true，或改用 acceptEdits / auto。',
    )
  }
}

const ERROR_HINTS: { match: RegExp, hint: string }[] = [
  {
    match: /error_max_budget_usd|max_budget|budget_exhausted/i,
    hint: '达到 maxBudgetUsd 预算上限，任务被中止 — 调高 maxBudgetUsd 或缩小任务范围 (max USD budget reached)',
  },
  {
    match: /authentication_failed|not authenticated|invalid api key|unauthorized|\b401\b|oauth/i,
    hint: 'Claude Code 认证失败 — 请先在终端运行一次 `claude` 完成登录 (authentication failed; run `claude` once to log in)',
  },
  {
    match: /billing|payment|credit balance|insufficient/i,
    hint: '订阅计费问题 — 请检查你的 Claude 订阅状态 (billing error; check your Claude subscription)',
  },
  {
    match: /rate_?limit|overloaded|too many requests|\b429\b|\b529\b/i,
    hint: '暂时限流或服务过载 — 稍后重试 (rate limited / overloaded; retry later)',
  },
  {
    match: /\b403\b|forbidden/i,
    hint: 'Anthropic 拒绝了请求（常见于数据中心出网 IP）— 给 DSH 进程设置 HTTPS_PROXY / HTTP_PROXY 后重启再试 (403; set a proxy for the DSH process)',
  },
  {
    match: /model_not_found|unknown model|invalid model|model.*not found/i,
    hint: 'model 参数无效 — 使用 sonnet / opus / haiku 或一个有效的完整模型 id (invalid model)',
  },
  {
    match: /no conversation found|could not find session|session .{0,40}not found|failed to resume|resume.{0,40}(failed|not found)/i,
    hint: 'resume 的会话不存在或已被清理 — 去掉 resume 重新发起一次任务 (resume session gone; retry without resume)',
  },
  {
    match: /enoent|not found.*claude|spawn.*claude/i,
    hint: CLAUDE_MISSING,
  },
]

/** Map a raw SDK/CLI failure onto an actionable message, keeping the original detail. */
function describeFailure(raw: string): string {
  const detail = raw.trim() || 'unknown error'
  for (const { match, hint } of ERROR_HINTS) {
    if (match.test(detail)) return `claude_code failed: ${hint} — ${detail}`
  }
  return `claude_code failed: ${detail}`
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

function toAgentDefinitions(subagents?: Record<string, SubagentConfig>): Record<string, AgentDefinition> | undefined {
  if (!subagents) return undefined
  const agents: Record<string, AgentDefinition> = {}
  for (const [agentName, def] of Object.entries(subagents)) {
    if (!def || typeof def.description !== 'string' || typeof def.prompt !== 'string') continue
    const agent: AgentDefinition = { description: def.description, prompt: def.prompt }
    if (def.tools?.length) agent.tools = def.tools
    if (def.disallowedTools?.length) agent.disallowedTools = def.disallowedTools
    if (def.model) agent.model = def.model
    if (typeof def.maxTurns === 'number') agent.maxTurns = def.maxTurns
    if (def.initialPrompt) agent.initialPrompt = def.initialPrompt
    if (def.background) agent.background = true
    agents[agentName] = agent
  }
  return Object.keys(agents).length ? agents : undefined
}

interface RunRequest {
  task: string
  cwd: string
  model: string
  permissionMode: string
  maxTurns: number
  allowedTools?: string[]
  pathToClaudeCodeExecutable?: string
  resume?: string
  effort?: string
  maxThinkingTokens?: number
  thinkingMode?: 'adaptive' | 'disabled'
  maxBudgetUsd?: number
  appendSystemPrompt?: string
  outputSchema?: Record<string, unknown>
  proxy?: string
  agents?: Record<string, AgentDefinition>
  allowDangerouslySkipPermissions: boolean
}

interface RunOutcome {
  output: string
  sessionId: string
  costUsd: number
  inputTokens: number
  outputTokens: number
  toolsUsed: string[]
  durationMs: number
  numTurns: number
  structuredOutput?: unknown
}

function buildQueryOptions(req: RunRequest, abort: AbortController): Options {
  const options: Options = {
    cwd: req.cwd,
    model: req.model,
    permissionMode: req.permissionMode as Options['permissionMode'],
    maxTurns: req.maxTurns,
    allowedTools: req.allowedTools,
    pathToClaudeCodeExecutable: req.pathToClaudeCodeExecutable,
    resume: req.resume,
    effort: req.effort as Options['effort'],
    abortController: abort,
    includePartialMessages: true,
    env: {
      ...process.env,
      CLAUDE_AGENT_SDK_CLIENT_APP: CLIENT_APP,
      ...(req.proxy ? {
        HTTPS_PROXY: req.proxy,
        HTTP_PROXY: req.proxy,
        ALL_PROXY: req.proxy,
        NO_PROXY: process.env.NO_PROXY ?? 'localhost,127.0.0.1',
      } : {}),
    },
  }
  if (req.allowDangerouslySkipPermissions) options.allowDangerouslySkipPermissions = true
  if (req.thinkingMode) options.thinking = { type: req.thinkingMode }
  else if (typeof req.maxThinkingTokens === 'number') options.maxThinkingTokens = req.maxThinkingTokens
  if (typeof req.maxBudgetUsd === 'number') options.maxBudgetUsd = req.maxBudgetUsd
  if (req.appendSystemPrompt) {
    options.systemPrompt = { type: 'preset', preset: 'claude_code', append: req.appendSystemPrompt }
  }
  if (req.agents) options.agents = req.agents
  if (req.outputSchema) options.outputFormat = { type: 'json_schema', schema: req.outputSchema }
  return options
}

async function runClaude(
  req: RunRequest,
  abort: AbortController,
  onDelta?: (text: string) => void,
): Promise<RunOutcome> {
  let output = ''
  let sessionId = ''
  let costUsd = 0
  let inputTokens = 0
  let outputTokens = 0
  let durationMs = 0
  let numTurns = 0
  let structuredOutput: unknown
  const toolsUsed = new Set<string>()
  let failure: string | undefined

  const stream = query({ prompt: req.task, options: buildQueryOptions(req, abort) })

  try {
    for await (const msg of stream) {
      if (msg.type === 'assistant') {
        sessionId = msg.session_id
        if (msg.error) failure = msg.error
        for (const block of msg.message.content) {
          if (block.type === 'text') output += block.text
          else if (block.type === 'tool_use') {
            toolsUsed.add(block.name)
            onDelta?.(`\n[tool] ${block.name}\n`)
          }
        }
      } else if (msg.type === 'stream_event') {
        const event = msg.event as any
        if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          const text = event.delta.text
          if (typeof text === 'string' && text) onDelta?.(text)
        }
      } else if (msg.type === 'result') {
        sessionId = msg.session_id
        numTurns = Number(msg.num_turns ?? 0)
        durationMs = Number(msg.duration_ms ?? 0)
        if (msg.subtype === 'success') {
          costUsd = typeof msg.total_cost_usd === 'number' ? msg.total_cost_usd : 0
          const usage = msg.usage as any
          if (usage) {
            inputTokens = Number(usage.input_tokens ?? 0)
            outputTokens = Number(usage.output_tokens ?? 0)
          }
          if (msg.structured_output !== undefined) structuredOutput = msg.structured_output
          if (!output.trim() && typeof msg.result === 'string') output = msg.result
        } else {
          const raw = msg as any
          const detail = raw.result ?? raw.error ?? (Array.isArray(raw.errors) && raw.errors.length ? raw.errors.join('; ') : undefined)
          const text = typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : ''
          failure = text ? `${msg.subtype}: ${text}` : msg.subtype
        }
      }
    }
  } catch (err) {
    throw new Error(describeFailure(errorText(err)))
  }

  // An aborted query can end its stream without throwing. Treat that as a
  // failure so background jobs report killed/timed-out instead of completed.
  if (abort.signal.aborted) {
    const reason = typeof abort.signal.reason === 'string' && abort.signal.reason
      ? abort.signal.reason
      : 'aborted'
    throw new Error(`claude_code ${reason}`)
  }

  if (failure) throw new Error(describeFailure(failure))

  if (!output.trim() && structuredOutput !== undefined) {
    output = JSON.stringify(structuredOutput, null, 2)
  }
  if (!output.trim()) throw new Error('claude_code returned no output')

  return {
    output: output.trim(),
    sessionId,
    costUsd,
    inputTokens,
    outputTokens,
    toolsUsed: [...toolsUsed],
    durationMs,
    numTurns,
    structuredOutput,
  }
}

/** Append-only text buffer that drops the oldest content once it exceeds the cap. */
function createBuffer() {
  let text = ''
  let dropped = false
  return {
    append(chunk: string) {
      text += chunk
      if (text.length > MAX_LIVE_BUFFER) {
        text = text.slice(text.length - MAX_LIVE_BUFFER)
        dropped = true
      }
    },
    /** Read and clear; the caller sees only what arrived since the previous read. */
    drain() {
      const chunk = dropped ? `…[earlier output truncated]…\n${text}` : text
      text = ''
      dropped = false
      return chunk
    },
    snapshot() {
      return dropped ? `…[earlier output truncated]…\n${text}` : text
    },
  }
}

interface JobOutcome {
  status: 'completed' | 'failed' | 'killed'
  detail?: string
  output?: string
}

function startBackgroundJob(jobs: any, req: RunRequest, timeoutMs: number, owner: unknown): string {
  const label = req.task.replace(/\s+/g, ' ').trim().slice(0, 60)
  return jobs.start({
    kind: 'claude-code',
    label,
    owner,
    run: () => {
      const abort = new AbortController()
      const pending = createBuffer()
      const full = createBuffer()
      let cancelled = false
      let timedOut = false
      let timer: ReturnType<typeof setTimeout> | undefined

      const onDelta = (text: string) => {
        pending.append(text)
        full.append(text)
      }

      const done: Promise<JobOutcome> = (async () => {
        try {
          const outcome = await runClaude(req, abort, onDelta)
          return {
            status: 'completed' as const,
            detail: `turns: ${outcome.numTurns}, duration: ${outcome.durationMs}ms`,
            output: outcome.output,
          }
        } catch (err) {
          if (cancelled) return { status: 'killed' as const, detail: 'cancelled' }
          if (timedOut) {
            return { status: 'failed' as const, detail: `timed out after ${timeoutMs}ms`, output: full.snapshot() }
          }
          return { status: 'failed' as const, detail: errorText(err), output: full.snapshot() }
        } finally {
          if (timer) clearTimeout(timer)
        }
      })()

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          timedOut = true
          abort.abort('timed out')
        }, timeoutMs)
        timer.unref?.()
      }

      return {
        cancel: () => {
          cancelled = true
          if (timer) clearTimeout(timer)
          abort.abort('cancelled')
        },
        done,
        readOutput: () => pending.drain(),
      }
    },
  })
}

export function apply(ctx: Context, config: Config) {
  ctx.skills.register(DELEGATION_SKILL)

  ctx.tools.register(defineTool({
    name: 'claude_code',
    description:
      "Delegate one self-contained coding task to your local Claude Code (running on your Claude subscription) " +
      "and return its final result text. Use it for a well-scoped subtask that benefits from Claude Code's own " +
      "agent loop and tools; give it everything it needs (goal, files, constraints) in the task string. " +
      "To continue a previous delegation with its remembered context, pass the sessionId you received earlier " +
      "as resume. Override the Claude model (model) and thinking effort (effort: low/medium/high/xhigh/max) per call. " +
      "For long tasks pass run_in_background: true — the call returns a jobId immediately and you stream its live " +
      "output with job_output, cancel with job_kill, and get a notification when it finishes. " +
      "This is a slow, expensive call; prefer it only when the work is genuinely self-contained.",
    parameters: {
      task: {
        type: 'string',
        description: 'Complete, self-contained task description for Claude Code (goal, context, files, constraints).',
        required: true,
      },
      cwd: { type: 'string', description: 'Working directory for Claude Code; defaults to the configured value or DSH cwd.' },
      model: { type: 'string', description: 'Override the Claude model alias/id for this call.' },
      permissionMode: {
        type: 'string',
        enum: [...PERMISSION_MODES],
        description: "Override Claude Code permission mode for this call (acceptEdits is the default; auto lets a classifier approve or deny prompts).",
      },
      maxTurns: { type: 'integer', description: 'Override the maximum number of Claude Code agentic turns for this call.' },
      allowedTools: {
        type: 'array',
        items: { type: 'string' },
        description: 'Override the Claude Code built-in tools to allow (e.g. Read, Edit, Bash, Grep, Glob).',
      },
      resume: {
        type: 'string',
        description: 'sessionId returned by an earlier claude_code call; resume that Claude Code session so it remembers its previous work. Omit for a fresh session.',
      },
      effort: {
        type: 'string',
        enum: [...EFFORT_LEVELS],
        description: "Override Claude Code thinking effort for this call (high is the default).",
      },
      maxThinkingTokens: {
        type: 'integer',
        description: 'Override the thinking token budget for this call (legacy; thinkingMode takes precedence).',
      },
      thinkingMode: {
        type: 'string',
        enum: [...THINKING_MODES],
        description: "Thinking mode for this call: adaptive (Claude decides how much to think) or disabled (no extended thinking).",
      },
      maxBudgetUsd: {
        type: 'number',
        description: 'Hard USD cost ceiling for this call; Claude Code stops once it is reached.',
      },
      appendSystemPrompt: {
        type: 'string',
        description: "Extra instructions appended to Claude Code's default system prompt for this call (conventions, prohibitions).",
      },
      outputSchema: {
        type: 'json',
        description: 'JSON Schema object; when given, Claude Code produces a structured result matching it, returned as structuredOutput.',
      },
      proxy: {
        type: 'string',
        description: 'HTTP proxy for this call (e.g. http://127.0.0.1:7897); overrides the plugin proxy config. Sets HTTPS_PROXY/HTTP_PROXY for the spawned claude.',
      },
      run_in_background: {
        type: 'boolean',
        description: 'Run the delegation as a DSH background job and return a jobId immediately; read live output with job_output, cancel with job_kill.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', description: 'True when the foreground delegation completed successfully.' },
          output: { type: 'string', description: 'Final result text from Claude Code.' },
          sessionId: { type: 'string', description: 'Claude Code session id; pass it back as resume to continue.' },
          costUsd: { type: 'number', description: 'Estimated cost of this delegation in USD.' },
          inputTokens: { type: 'integer', description: 'Input tokens used by the main agent loop.' },
          outputTokens: { type: 'integer', description: 'Output tokens used by the main agent loop.' },
          toolsUsed: { type: 'array', items: { type: 'string' }, description: 'Claude Code tools invoked during the run.' },
          durationMs: { type: 'integer', description: 'Wall-clock duration of the run in milliseconds.' },
          numTurns: { type: 'integer', description: 'Number of agentic turns Claude Code took.' },
          structuredOutput: { type: 'json', description: 'Structured result when outputSchema was supplied.' },
          kind: { type: 'string', enum: ['background'], description: 'Present only for background delegations.' },
          jobId: { type: 'string', description: 'Background job id; use it with job_output / job_kill.' },
        },
      },
      render: (_args: any, value: any) => {
        if (value.kind === 'background') {
          return [{
            type: 'text',
            text: `started background job ${value.jobId} — use job_output to stream output, job_kill to cancel; you will be notified when it finishes.`,
          }]
        }
        const stats = [
          `turns: ${value.numTurns ?? 0}`,
          `cost: $${Number(value.costUsd ?? 0).toFixed(4)}`,
          `tokens: ${value.inputTokens ?? 0} in / ${value.outputTokens ?? 0} out`,
        ].join(', ')
        let text = value.output ?? ''
        if (value.structuredOutput !== undefined) {
          text += `\n\nstructured output:\n${JSON.stringify(value.structuredOutput, null, 2)}`
        }
        return [{ type: 'text', text: `${text}\n\n(${stats})` }]
      },
    },
    timeoutMs: config.timeoutMs,
    async execute(args: any, exec) {
      const req: RunRequest = {
        task: args.task,
        cwd: args.cwd ?? config.cwd ?? process.cwd(),
        model: args.model ?? config.model,
        permissionMode: args.permissionMode ?? config.permissionMode,
        maxTurns: args.maxTurns ?? config.maxTurns,
        allowedTools: args.allowedTools ?? config.allowedTools,
        pathToClaudeCodeExecutable: config.pathToClaudeCodeExecutable,
        resume: args.resume,
        effort: args.effort ?? config.effort,
        maxThinkingTokens: args.maxThinkingTokens ?? config.maxThinkingTokens,
        thinkingMode: args.thinkingMode ?? config.thinkingMode,
        maxBudgetUsd: args.maxBudgetUsd ?? config.maxBudgetUsd,
        appendSystemPrompt: args.appendSystemPrompt ?? config.appendSystemPrompt,
        outputSchema: args.outputSchema,
        proxy: args.proxy ?? config.proxy,
        agents: toAgentDefinitions(config.subagents),
        allowDangerouslySkipPermissions: config.allowDangerouslySkipPermissions === true,
      }

      preflight(req)

      if (args.run_in_background) {
        const jobs = ctx.get('jobs')
        if (!jobs) throw new Error('background jobs unavailable: load @deepseek-ai/dsh-tool-jobs')
        const jobId = startBackgroundJob(jobs, req, config.timeoutMs, exec.agent)
        return { kind: 'background' as const, jobId }
      }

      const abort = new AbortController()
      const onAbort = () => abort.abort()
      exec.signal.addEventListener('abort', onAbort, { once: true })
      try {
        const outcome = await runClaude(req, abort)
        return {
          ok: true,
          output: outcome.output,
          sessionId: outcome.sessionId,
          costUsd: outcome.costUsd,
          inputTokens: outcome.inputTokens,
          outputTokens: outcome.outputTokens,
          toolsUsed: outcome.toolsUsed,
          durationMs: outcome.durationMs,
          numTurns: outcome.numTurns,
          ...(outcome.structuredOutput !== undefined ? { structuredOutput: outcome.structuredOutput as any } : {}),
        }
      } finally {
        exec.signal.removeEventListener('abort', onAbort)
      }
    },
    presentCall: (args: any) => ({
      card: 'generic',
      title: args.run_in_background ? 'Claude Code (background)' : 'Claude Code',
      kind: 'other',
      rawInput: { task: typeof args.task === 'string' ? args.task.slice(0, 200) : args.task },
    }),
  }))
}
