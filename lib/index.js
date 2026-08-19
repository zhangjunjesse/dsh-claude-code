import z from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { JobTracker, createEventBuffer } from './tracker.js';
import { ClaudeCodeRemote } from './remote.js';
import { DEFAULT_STALE_AFTER_MINUTES, readUsageSnapshot, renderUsage } from './usage.js';
export const name = 'claude-code';
export const inject = ['tools', 'skills'];
const CLIENT_APP = 'dsh-claude-code/0.3.3';
/** Cap for the live-output buffers kept per background job. */
const MAX_LIVE_BUFFER = 500_000;
/** Cap for one tool_result / result payload carried on the event stream. */
const MAX_EVENT_TEXT = 2000;
const PERMISSION_MODES = ['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk', 'auto'];
const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];
const THINKING_MODES = ['adaptive', 'disabled'];
export const Config = z.object({
    model: z.string().description('Claude model alias (sonnet/opus/haiku) or full id.').default('sonnet'),
    permissionMode: z.string()
        .description("Claude Code permission mode: default, acceptEdits, bypassPermissions, plan, dontAsk, or auto.")
        .default('acceptEdits'),
    maxTurns: z.number().description('Maximum Claude Code agentic turns per task.').default(100),
    timeoutMs: z.number().description('Hard timeout budget for one call (ms); background tasks are aborted once it is reached.').default(7200000),
    warnTimeoutMs: z.number().description('Emit a warning event (do NOT abort) after the task has run this long (ms); 0 disables.').default(3600000),
    warnIntervalMs: z.number().description('Repeat the warning every N ms while the task keeps running past warnTimeoutMs (ms); 0 disables repeats.').default(1800000),
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
    proxy: z.string().description('HTTP proxy for the claude subprocess (e.g. http://127.0.0.1:7897). ' +
        'Sets HTTPS_PROXY/HTTP_PROXY/ALL_PROXY for the spawned claude; useful when the machine outbound IP is a ' +
        'datacenter IP and Anthropic rejects requests (403) without a proxy. NO_PROXY keeps localhost direct.'),
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
});
const DELEGATION_SKILL = {
    name: 'claude-code-delegation',
    description: 'Leader-Worker 流程：把自包含的编码子任务（写/改插件、重构、修 bug 补测试）委派给本机 Claude Code 订阅执行并循环质检。任务需要 Claude Code 自己读文件、跑循环时用它。',
    whenToUse: '用户要求写/改代码且任务自包含、边界清晰（尤其"让 Claude 来写/修 XX"）；或维护 dsh-claude-code 插件本身时。',
    source: 'runtime',
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
        '- Web 端还有个「Claude Code」监控面板（会话头第三个标签页）：任务列表 + 原生风格实时输出（工具卡片带参数与结果、思考块可折叠）+ 取消，人类用户可以自己盯，你不用替他转述实时输出。',
        '',
        '## 派活前看额度（claude_code_usage）',
        '- 纯本地读缓存，零 token、毫秒级：拿到 5 小时 / 7 天窗口用量、重置时间、订阅档位和一个 advice（normal / caution / blocked）。',
        '- advice 是 caution 就少派、别并发；是 blocked 就先别派，告诉用户重置时间。',
        '- 数据是 claude CLI 的缓存，每次委派后会自动刷新；显示 maybeStale 时按"可能偏低"看待。',
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
        '## 超时与告警（两级超时）',
        '- 硬超时 timeoutMs（默认 2h）：到点自动中止任务（failed timed out）；可用参数覆盖。',
        '- 告警 warnTimeoutMs（默认 1h）+ 周期 warnIntervalMs（默认 30min）：不中止，只在面板事件流里醒目标注"任务已运行 X"提醒处理。',
        '- 收到告警且任务无明显进展时：建议让用户决策——继续等 / 取消 / 用 resume 缩小范围重派；不要自作主张强杀。',
        '## 成本与延迟',
        '- 每次约 10 秒起步、按订阅计费（小任务实测约 0.1~0.2 美元）。',
        '- 琐碎小问不派；一个"完整子任务"才派。',
        '',
        '## 插件维护（改 dsh-claude-code 本身）',
        '- 改完源码：npm run build，再按安装方式重新部署（本地：cp -R 覆盖 profile node_modules 下的 dsh-claude-code），最后重启 dsh。',
        '- 其他用户安装：dsh plugin add dsh-claude-code（npm 包带 bundle manifest，自动接线）。',
    ].join("\n"),
};
const PARALLEL_DEV_SKILL = {
    name: 'parallel-dev',
    description: '并行开发编排：把多个开发任务自动编排成并行执行——判断是否需要用 git worktree、自动建分支与目录、并行分派给 claude_code、完成后集成。用户只需要说"并行开发 A 和 B"，不需要懂任何 git 细节。',
    whenToUse: '用户要求并行/同时开发多个模块或任务（"一起做""并行""同时推进""分开做"）；或用户列出多个开发目标且明显希望加快整体进度；或单个大任务需要拆分并行。',
    source: 'runtime',
    content: [
        '# 并行开发编排 SOP（parallel-dev）',
        '',
        'DSH 是编排者：把"并行开发多个模块"这件事自动落地，用户只提需求、不问技术细节（包括是否用 worktree）。',
        '',
        '## 何时用 / 何时不用',
        '- 用：用户要求并行/同时开发多个模块或任务；多个任务互不依赖或依赖关系已明确；大任务可拆成多个自包含子任务。',
        '- 不用：单一任务、串行即可满足（默认）；任务之间强依赖且无法并行（先做 A 才能做 B）；用户没有表达并行意图。',
        '',
        '## 决策树（先想清楚，再动手）',
        '1. 并行任务数 ≥ 2 且都涉及写代码？否 → 串行顺序做，不建 worktree，不打扰用户。',
        '2. 任务改的是同一个仓库？否 → 各自独立目录，直接并行，不建 worktree。',
        '3. 改动文件可能重叠？已确认完全不重叠 → 可共享工作区并行；否则/不确定 → 用 worktree 隔离。',
        '4. 用 worktree：每个任务一个分支（feat/<模块名>）+ 一个独立目录（../proj-<模块名>），互不踩文件。',
        '',
        '## 确认边界（只问业务，绝不问技术）',
        '- 明确说"并行/一起/同时/分开做" → 直接执行，不确认。',
        '- 没提并行 → 默认串行，不确认，按合理顺序逐个做。',
        '- 暗示了并行但没说清（如"这两个都很急""两个都做完"）→ 确认一次，只问业务："A 和 B 要并行推进，还是先后做？"',
        '- 永远不要问用户"要不要开 worktree / 用哪个分支"——那是编排层的职责。',
        '',
        '## worktree 操作（命令模板，用户不可见，直接执行）',
        '- 查看现有：git worktree list',
        '- 建 worktree：git worktree add ../proj-<模块名> feat/<模块名>（从 main 拉出）',
        '- 注意：同一分支不能 checkout 到两个 worktree；main 只保留一个集成用 worktree。',
        '',
        '## 并行分派',
        '- 每个任务用 claude_code 委派，cwd 指向对应 worktree 目录，建议 run_in_background: true 并行跑。',
        '- 任务书照 claude-code-delegation SOP：目标 / 相关文件绝对路径 / 约束（构建验证命令、禁止事项）/ 验收。',
        '- 依赖模块之间：先定接口契约（把接口定义写进各自任务书），或让下游任务引用上游分支的提交。',
        '- 派完不要空等：用 job_output 增量读进展，各自 review 产出，不满意带反馈再派一轮（resume 传 sessionId）。',
        '',
        '## 集成与收尾',
        '- 每个模块完成：在其 worktree 里跑构建/测试验证通过后提交（git -C ../proj-<名> commit）。',
        '- 全部完成后：回主 worktree（main），逐个 merge 各分支，跑一次整体构建/测试。',
        '- 清理：git worktree remove ../proj-<模块名>（保留分支或删除均可）。',
        '- 集成冲突：按模块边界解决；小步提交（每模块一个可编译增量）能显著减少冲突。',
        '',
        '## 注意',
        '- 每个 worktree 独立装依赖/构建（node_modules 各自一份，磁盘占用翻倍是并行的正常代价）。',
        '- 不要跨 worktree 同时 push 同一个分支；push 统一走 main 集成后的提交。',
        '- 用户关心的是结果：并行方案、分支名、worktree 目录都不需要汇报细节，只汇报"哪些模块已完成/进行中/阻塞"。',
    ].join("\n"),
};
const CLAUDE_MISSING = 'claude executable not found — install it with: npm install -g @anthropic-ai/claude-code';
/** Positive PATH probes are cached; a negative result is re-probed so a later install is picked up. */
let claudeOnPath = false;
function hasClaudeOnPath() {
    if (claudeOnPath)
        return true;
    const probe = process.platform === 'win32' ? 'where' : 'which';
    try {
        const result = spawnSync(probe, ['claude'], { stdio: 'ignore', windowsHide: true });
        claudeOnPath = result.status === 0;
    }
    catch {
        claudeOnPath = false;
    }
    return claudeOnPath;
}
/** Fast, synchronous checks that turn the common misconfigurations into actionable errors. */
function preflight(opts) {
    let isDirectory = false;
    try {
        isDirectory = statSync(opts.cwd).isDirectory();
    }
    catch {
        isDirectory = false;
    }
    if (!isDirectory)
        throw new Error(`cwd does not exist or is not a directory: ${opts.cwd}`);
    if (opts.pathToClaudeCodeExecutable) {
        if (!existsSync(opts.pathToClaudeCodeExecutable)) {
            throw new Error(`${CLAUDE_MISSING} (configured pathToClaudeCodeExecutable does not exist: ${opts.pathToClaudeCodeExecutable})`);
        }
    }
    else if (!hasClaudeOnPath()) {
        throw new Error(CLAUDE_MISSING);
    }
    if (opts.permissionMode === 'bypassPermissions' && !opts.allowDangerouslySkipPermissions) {
        throw new Error('permissionMode "bypassPermissions" 会让 Claude Code 跳过全部权限确认，属于有意的安全开关：' +
            '请在插件配置里显式设置 allowDangerouslySkipPermissions: true，或改用 acceptEdits / auto。');
    }
}
const ERROR_HINTS = [
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
];
/** Map a raw SDK/CLI failure onto an actionable message, keeping the original detail. */
function describeFailure(raw) {
    const detail = raw.trim() || 'unknown error';
    for (const { match, hint } of ERROR_HINTS) {
        if (match.test(detail))
            return `claude_code failed: ${hint} — ${detail}`;
    }
    return `claude_code failed: ${detail}`;
}
function errorText(err) {
    if (err instanceof Error)
        return err.message;
    if (typeof err === 'string')
        return err;
    try {
        return JSON.stringify(err);
    }
    catch {
        return String(err);
    }
}
function toAgentDefinitions(subagents) {
    if (!subagents)
        return undefined;
    const agents = {};
    for (const [agentName, def] of Object.entries(subagents)) {
        if (!def || typeof def.description !== 'string' || typeof def.prompt !== 'string')
            continue;
        const agent = { description: def.description, prompt: def.prompt };
        if (def.tools?.length)
            agent.tools = def.tools;
        if (def.disallowedTools?.length)
            agent.disallowedTools = def.disallowedTools;
        if (def.model)
            agent.model = def.model;
        if (typeof def.maxTurns === 'number')
            agent.maxTurns = def.maxTurns;
        if (def.initialPrompt)
            agent.initialPrompt = def.initialPrompt;
        if (def.background)
            agent.background = true;
        agents[agentName] = agent;
    }
    return Object.keys(agents).length ? agents : undefined;
}
/** JSON or nothing — used for values that only ever travel over the wire. */
function safeJson(value) {
    try {
        return JSON.stringify(value) ?? String(value);
    }
    catch {
        return String(value);
    }
}
/** Cap one event payload, marking the cut so the panel can say so. */
function capEventText(text) {
    return text.length > MAX_EVENT_TEXT ? `${text.slice(0, MAX_EVENT_TEXT)}…[truncated]` : text;
}
/** Keep a tool_use input only when it survives a JSON round trip. */
function toEventInput(input) {
    try {
        JSON.stringify(input);
        return input;
    }
    catch {
        return String(input);
    }
}
/**
 * Flatten a `tool_result` payload into one plain string: the SDK hands it over
 * as a bare string or as a block array (text / image / anything a tool emits).
 */
function toResultText(content) {
    if (typeof content === 'string')
        return content;
    if (content === undefined || content === null)
        return '';
    if (Array.isArray(content)) {
        return content.map((part) => {
            if (typeof part === 'string')
                return part;
            if (part && typeof part === 'object') {
                if (typeof part.text === 'string')
                    return part.text;
                if (part.type === 'image')
                    return '[image]';
            }
            return safeJson(part);
        }).join('\n');
    }
    return safeJson(content);
}
function buildQueryOptions(req, abort) {
    const options = {
        cwd: req.cwd,
        model: req.model,
        permissionMode: req.permissionMode,
        maxTurns: req.maxTurns,
        allowedTools: req.allowedTools,
        pathToClaudeCodeExecutable: req.pathToClaudeCodeExecutable,
        resume: req.resume,
        effort: req.effort,
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
    };
    if (req.allowDangerouslySkipPermissions)
        options.allowDangerouslySkipPermissions = true;
    if (req.thinkingMode)
        options.thinking = { type: req.thinkingMode };
    else if (typeof req.maxThinkingTokens === 'number')
        options.maxThinkingTokens = req.maxThinkingTokens;
    if (typeof req.maxBudgetUsd === 'number')
        options.maxBudgetUsd = req.maxBudgetUsd;
    if (req.appendSystemPrompt) {
        options.systemPrompt = { type: 'preset', preset: 'claude_code', append: req.appendSystemPrompt };
    }
    if (req.agents)
        options.agents = req.agents;
    if (req.outputSchema)
        options.outputFormat = { type: 'json_schema', schema: req.outputSchema };
    return options;
}
/**
 * Run one delegation.
 *
 * Two independent observers may follow it. `onDelta` is the TEXT stream the
 * model's `job_output` consumes — token-level, append-only, unchanged since
 * 0.2.0. `onEvent` is the STRUCTURED stream the monitor panel renders: one
 * event per completed content block, in arrival order. Partial deltas are
 * deliberately not mirrored into events, so the panel paints whole blocks
 * instead of flickering character by character.
 */
async function runClaude(req, abort, onDelta, onEvent) {
    let output = '';
    let sessionId = '';
    let costUsd = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let durationMs = 0;
    let numTurns = 0;
    let structuredOutput;
    const toolsUsed = new Set();
    let failure;
    const stream = query({ prompt: req.task, options: buildQueryOptions(req, abort) });
    try {
        for await (const msg of stream) {
            if (msg.type === 'assistant') {
                sessionId = msg.session_id;
                if (msg.error)
                    failure = msg.error;
                for (const block of msg.message.content) {
                    if (block.type === 'text') {
                        output += block.text;
                        if (block.text)
                            onEvent?.({ type: 'text', text: block.text });
                    }
                    else if (block.type === 'thinking') {
                        const thinking = typeof block.thinking === 'string' ? block.thinking : '';
                        if (thinking) {
                            onEvent?.({
                                type: 'thinking',
                                thinking,
                                ...(typeof block.signature === 'string' ? { signature: block.signature } : {}),
                            });
                        }
                    }
                    else if (block.type === 'tool_use') {
                        toolsUsed.add(block.name);
                        onDelta?.(`\n[tool] ${block.name}\n`);
                        onEvent?.({
                            type: 'tool_use',
                            ...(typeof block.id === 'string' ? { id: block.id } : {}),
                            name: String(block.name),
                            input: toEventInput(block.input),
                        });
                    }
                }
            }
            else if (msg.type === 'user') {
                // Tool results come back as a user turn. Replays (a resumed session
                // re-emitting its history) would duplicate the panel's stream.
                const raw = msg;
                const content = raw.message?.content;
                if (raw.isReplay !== true && Array.isArray(content)) {
                    for (const block of content) {
                        if (block?.type !== 'tool_result')
                            continue;
                        onEvent?.({
                            type: 'tool_result',
                            tool_use_id: typeof block.tool_use_id === 'string' ? block.tool_use_id : null,
                            content: capEventText(toResultText(block.content)),
                            ...(block.is_error === true ? { isError: true } : {}),
                        });
                    }
                }
            }
            else if (msg.type === 'stream_event') {
                const event = msg.event;
                if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                    const text = event.delta.text;
                    if (typeof text === 'string' && text)
                        onDelta?.(text);
                }
            }
            else if (msg.type === 'result') {
                sessionId = msg.session_id;
                numTurns = Number(msg.num_turns ?? 0);
                durationMs = Number(msg.duration_ms ?? 0);
                let resultText = '';
                if (msg.subtype === 'success') {
                    costUsd = typeof msg.total_cost_usd === 'number' ? msg.total_cost_usd : 0;
                    const usage = msg.usage;
                    if (usage) {
                        inputTokens = Number(usage.input_tokens ?? 0);
                        outputTokens = Number(usage.output_tokens ?? 0);
                    }
                    if (msg.structured_output !== undefined)
                        structuredOutput = msg.structured_output;
                    if (typeof msg.result === 'string')
                        resultText = msg.result;
                    if (!output.trim() && typeof msg.result === 'string')
                        output = msg.result;
                }
                else {
                    const raw = msg;
                    const detail = raw.result ?? raw.error ?? (Array.isArray(raw.errors) && raw.errors.length ? raw.errors.join('; ') : undefined);
                    const text = typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : '';
                    failure = text ? `${msg.subtype}: ${text}` : msg.subtype;
                    resultText = failure;
                }
                onEvent?.({
                    type: 'result',
                    text: capEventText(resultText),
                    costUsd,
                    numTurns,
                    durationMs,
                    ...(msg.subtype === 'success' ? {} : { isError: true }),
                });
            }
        }
    }
    catch (err) {
        throw new Error(describeFailure(errorText(err)));
    }
    // An aborted query can end its stream without throwing. Treat that as a
    // failure so background jobs report killed/timed-out instead of completed.
    if (abort.signal.aborted) {
        const reason = typeof abort.signal.reason === 'string' && abort.signal.reason
            ? abort.signal.reason
            : 'aborted';
        throw new Error(`claude_code ${reason}`);
    }
    if (failure)
        throw new Error(describeFailure(failure));
    if (!output.trim() && structuredOutput !== undefined) {
        output = JSON.stringify(structuredOutput, null, 2);
    }
    if (!output.trim())
        throw new Error('claude_code returned no output');
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
    };
}
/**
 * Append-only text buffer that drops the oldest content once it exceeds the cap.
 *
 * Two independent cursors live on top of it: `drain()` is the model's
 * `job_output` cursor (read-and-clear), while `read(fromOffset)` answers the
 * monitor panel from an ABSOLUTE offset, so any number of UI readers can follow
 * the same job without ever stealing the model's bytes. `absoluteBase` is the
 * absolute index of the first character still held.
 */
function createBuffer() {
    let text = '';
    let dropped = false;
    let absoluteBase = 0;
    return {
        append(chunk) {
            text += chunk;
            if (text.length > MAX_LIVE_BUFFER) {
                const excess = text.length - MAX_LIVE_BUFFER;
                text = text.slice(excess);
                absoluteBase += excess;
                dropped = true;
            }
        },
        /** Read and clear; the caller sees only what arrived since the previous read. */
        drain() {
            const chunk = dropped ? `…[earlier output truncated]…\n${text}` : text;
            absoluteBase += text.length;
            text = '';
            dropped = false;
            return chunk;
        },
        snapshot() {
            return dropped ? `…[earlier output truncated]…\n${text}` : text;
        },
        /** Absolute-offset read used by the monitor panel; leaves the buffer intact. */
        read(fromOffset) {
            const end = absoluteBase + text.length;
            const requested = Math.max(0, Math.min(fromOffset, end));
            const truncated = requested < absoluteBase;
            const start = truncated ? absoluteBase : requested;
            return { text: text.slice(start - absoluteBase), nextOffset: end, truncated };
        },
    };
}
function startBackgroundJob(jobs, req, owner, tracker) {
    const timeoutMs = req.timeoutMs;
    const warnTimeoutMs = req.warnTimeoutMs;
    const warnIntervalMs = req.warnIntervalMs;
    const label = req.task.replace(/\s+/g, ' ').trim().slice(0, 60);
    // `run()` executes synchronously inside `jobs.start()`, so these handles are
    // set by the time the registry hands back the job id.
    let handles;
    const jobId = jobs.start({
        kind: 'claude-code',
        label,
        owner,
        run: () => {
            const abort = new AbortController();
            const pending = createBuffer();
            const full = createBuffer();
            const events = createEventBuffer();
            let cancelled = false;
            let cancelledFromUi = false;
            let timedOut = false;
            let settled = false;
            let timer;
            let settlement = { status: 'failed' };
            const onDelta = (text) => {
                pending.append(text);
                full.append(text);
            };
            const onEvent = (event) => { events.append(event); };
            const cancel = (fromUi) => {
                if (settled || cancelled)
                    return false;
                cancelled = true;
                cancelledFromUi = fromUi;
                if (timer)
                    clearTimeout(timer);
                abort.abort('cancelled');
                return true;
            };
            const done = (async () => {
                try {
                    const outcome = await runClaude(req, abort, onDelta, onEvent);
                    const cost = typeof outcome.costUsd === 'number' ? `$${outcome.costUsd.toFixed(2)}` : '$0.00';
                    const mins = Math.floor(outcome.durationMs / 60000);
                    const secs = Math.floor((outcome.durationMs % 60000) / 1000);
                    settlement = {
                        status: 'completed',
                        claudeSessionId: outcome.sessionId,
                        costUsd: outcome.costUsd,
                        numTurns: outcome.numTurns,
                        durationMs: outcome.durationMs,
                        finalOutput: outcome.output,
                    };
                    return {
                        status: 'completed',
                        detail: `${cost} · ${outcome.numTurns} turns · ${mins}m${secs}s`,
                        output: outcome.output,
                    };
                }
                catch (err) {
                    if (cancelled) {
                        // UI cancellation goes through this same path on purpose: the job
                        // settles normally, so the model still receives its notification.
                        const detail = cancelledFromUi ? 'cancelled by user (UI)' : 'cancelled';
                        settlement = { status: 'killed', failureDetail: detail, finalOutput: full.snapshot() };
                        return { status: 'killed', detail };
                    }
                    const detail = timedOut ? `timed out after ${timeoutMs}ms` : errorText(err);
                    settlement = { status: 'failed', failureDetail: detail, finalOutput: full.snapshot() };
                    return { status: 'failed', detail, output: full.snapshot() };
                }
                finally {
                    settled = true;
                    if (timer)
                        clearTimeout(timer);
                }
            })();
            if (timeoutMs > 0) {
                timer = setTimeout(() => {
                    timedOut = true;
                    abort.abort('timed out');
                }, timeoutMs);
                timer.unref?.();
            }
            // Two-stage timeout: warn first (warnTimeoutMs), then keep reminding
            // every warnIntervalMs while the task still runs. Warnings go into the
            // structured event stream (the panel renders them prominently) and do
            // NOT abort the task — only the hard timeoutMs does.
            const startedAt = Date.now();
            if (warnTimeoutMs > 0 && (timeoutMs <= 0 || warnTimeoutMs < timeoutMs)) {
                const warnTimer = setTimeout(function tick() {
                    const mins = Math.floor((Date.now() - startedAt) / 60000);
                    const hard = timeoutMs > 0
                        ? ` · 将于 ${Math.floor(timeoutMs / 60000)}m 后强制中止`
                        : '';
                    events.append({ type: 'warning', text: `⚠️ 任务已运行 ${mins}m${hard}` });
                    if (!settled && warnIntervalMs > 0) {
                        const next = setTimeout(tick, warnIntervalMs);
                        next.unref?.();
                    }
                }, warnTimeoutMs);
                warnTimer.unref?.();
            }
            handles = {
                read: (fromOffset) => full.read(fromOffset),
                events,
                cancelFromUi: () => cancel(true),
                done,
                settlement: () => settlement,
            };
            return {
                cancel: () => { cancel(false); },
                done,
                readOutput: () => pending.drain(),
            };
        },
    });
    if (handles) {
        const resolved = handles;
        tracker.register({
            jobId,
            ...(owner?.id !== undefined ? { ownerSessionId: owner.id } : {}),
            task: req.task,
            label,
            read: resolved.read,
            events: resolved.events,
            cancelFromUi: resolved.cancelFromUi,
        });
        resolved.done.then(() => tracker.settle(jobId, resolved.settlement()), (err) => tracker.settle(jobId, { status: 'failed', failureDetail: errorText(err) }));
    }
    return jobId;
}
export function apply(ctx, config) {
    ctx.skills.register(DELEGATION_SKILL);
    ctx.skills.register(PARALLEL_DEV_SKILL);
    // Plugin-owned mirror of this session's delegations, plus the RPC surface the
    // monitor panel (client half) reads it through. Both are process-local and go
    // away with the plugin's fiber.
    const tracker = new JobTracker();
    // The remote also serves the panel's usage bar, so it gets the same claude
    // executable the usage tool reads through.
    new ClaudeCodeRemote(ctx, tracker, config.pathToClaudeCodeExecutable);
    ctx.tools.register(defineTool({
        name: 'claude_code_usage',
        description: "Read the local Claude subscription's usage quota (5-hour and 7-day rolling windows, reset times, " +
            "per-limit severities, plan tier) so you can decide whether another claude_code delegation is safe right now. " +
            "The data comes from the claude CLI's own cache in ~/.claude.json — reading it is free, local and instant, " +
            "but it is a cache: every claude_code delegation refreshes it, so it is freshest right after one finishes. " +
            "No credentials are ever read and no account identity is returned.",
        parameters: {
            staleAfterMinutes: {
                type: 'integer',
                description: 'Mark the cached data as possibly stale once it is older than this many minutes (default 30).',
            },
            forceRefresh: {
                type: 'boolean',
                description: 'Reserved: actively refreshing would burn real quota, so it is not supported yet and only adds a warning.',
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: true,
                properties: {
                    ok: { type: 'boolean', description: 'True when a usage snapshot could be read.' },
                    loggedIn: { type: 'boolean', description: 'Whether the local claude CLI is currently logged in.' },
                    error: { type: 'string', description: 'Actionable failure reason; present only when ok is false.' },
                    subscription: { type: 'json', description: 'Plan descriptors: { type, rateLimitTier, billingType }.' },
                    fiveHour: { type: 'json', description: 'Five-hour window: { utilizationPercent, resetsAt }.' },
                    sevenDay: { type: 'json', description: 'Seven-day window: { utilizationPercent, resetsAt }.' },
                    limits: { type: 'json', description: 'Per-limit rows: { kind, group, percent, severity, resetsAt, scopeModel, isActive }.' },
                    spend: { type: 'json', description: 'Dollar spend block; disabled on subscription accounts.' },
                    extraUsage: { type: 'json', description: 'Extra-usage credits: { isEnabled, disabledReason }.' },
                    cache: { type: 'json', description: 'Cache freshness: { fetchedAt, ageMinutes, maybeStale, source }.' },
                    advice: {
                        type: 'string',
                        enum: ['normal', 'caution', 'blocked', 'unknown'],
                        description: 'Derived signal: normal, caution (any window >= 80%), blocked (>= 95% or a non-normal severity), unknown.',
                    },
                    warnings: { type: 'array', items: { type: 'string' }, description: 'Degradation notes (stale cache, missing fields, login expired).' },
                },
            },
            render: (_args, value) => [{ type: 'text', text: renderUsage(value) }],
        },
        async execute(args) {
            return readUsageSnapshot({
                staleAfterMinutes: typeof args.staleAfterMinutes === 'number' ? args.staleAfterMinutes : DEFAULT_STALE_AFTER_MINUTES,
                forceRefresh: args.forceRefresh === true,
                ...(config.pathToClaudeCodeExecutable ? { pathToClaudeCodeExecutable: config.pathToClaudeCodeExecutable } : {}),
            });
        },
        presentCall: () => ({
            card: 'generic',
            title: 'Claude 订阅额度',
            kind: 'other',
            rawInput: {},
        }),
    }));
    ctx.tools.register(defineTool({
        name: 'claude_code',
        description: "Delegate one self-contained coding task to your local Claude Code (running on your Claude subscription) " +
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
            timeoutMs: {
                type: 'integer',
                description: 'Hard timeout in ms for this call (background tasks are aborted once reached); overrides the plugin config.',
            },
            warnTimeoutMs: {
                type: 'integer',
                description: 'Emit a warning event (no abort) after the task has run this long (ms); overrides the plugin config; 0 disables.',
            },
            warnIntervalMs: {
                type: 'integer',
                description: 'Repeat the warning every N ms while the task keeps running past warnTimeoutMs; overrides the plugin config; 0 disables repeats.',
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
            render: (_args, value) => {
                if (value.kind === 'background') {
                    return [{
                            type: 'text',
                            text: `started background job ${value.jobId} — use job_output to stream output, job_kill to cancel; you will be notified when it finishes.`,
                        }];
                }
                const stats = [
                    `turns: ${value.numTurns ?? 0}`,
                    `cost: $${Number(value.costUsd ?? 0).toFixed(4)}`,
                    `tokens: ${value.inputTokens ?? 0} in / ${value.outputTokens ?? 0} out`,
                ].join(', ');
                let text = value.output ?? '';
                if (value.structuredOutput !== undefined) {
                    text += `\n\nstructured output:\n${JSON.stringify(value.structuredOutput, null, 2)}`;
                }
                return [{ type: 'text', text: `${text}\n\n(${stats})` }];
            },
        },
        timeoutMs: config.timeoutMs,
        async execute(args, exec) {
            const req = {
                task: args.task,
                cwd: args.cwd ?? config.cwd ?? process.cwd(),
                model: args.model ?? config.model,
                permissionMode: args.permissionMode ?? config.permissionMode,
                maxTurns: args.maxTurns ?? config.maxTurns,
                timeoutMs: args.timeoutMs ?? config.timeoutMs,
                warnTimeoutMs: args.warnTimeoutMs ?? config.warnTimeoutMs,
                warnIntervalMs: args.warnIntervalMs ?? config.warnIntervalMs,
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
            };
            preflight(req);
            if (args.run_in_background) {
                const jobs = ctx.get('jobs');
                if (!jobs)
                    throw new Error('background jobs unavailable: load @deepseek-ai/dsh-tool-jobs');
                const jobId = startBackgroundJob(jobs, req, exec.agent, tracker);
                return { kind: 'background', jobId };
            }
            const abort = new AbortController();
            const onAbort = () => abort.abort();
            exec.signal.addEventListener('abort', onAbort, { once: true });
            try {
                const outcome = await runClaude(req, abort);
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
                    ...(outcome.structuredOutput !== undefined ? { structuredOutput: outcome.structuredOutput } : {}),
                };
            }
            finally {
                exec.signal.removeEventListener('abort', onAbort);
            }
        },
        presentCall: (args) => ({
            card: 'generic',
            title: args.run_in_background ? 'Claude Code (background)' : 'Claude Code',
            kind: 'other',
            rawInput: { task: typeof args.task === 'string' ? args.task.slice(0, 200) : args.task },
        }),
    }));
}
