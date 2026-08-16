import z from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { query } from '@anthropic-ai/claude-agent-sdk';
export const name = 'claude-code';
export const inject = ['tools', 'skills'];
export const Config = z.object({
    model: z.string().description('Claude model alias (sonnet/opus/haiku) or full id.').default('sonnet'),
    permissionMode: z.string()
        .description("Claude Code permission mode: default, acceptEdits, bypassPermissions, plan, or dontAsk.")
        .default('acceptEdits'),
    maxTurns: z.number().description('Maximum Claude Code agentic turns per task.').default(100),
    timeoutMs: z.number().description('Cooperative timeout budget for one call (ms).').default(600000),
    cwd: z.string().description('Working directory for Claude Code; defaults to the DSH workspace cwd.'),
    allowedTools: z.array(z.string()).description('Claude Code built-in tools to allow.'),
    pathToClaudeCodeExecutable: z.string().description('Path to the claude executable; auto-detected when omitted.'),
});
const PERMISSION_MODES = ['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk'];
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
        '## 成本与延迟',
        '- 每次约 10 秒起步、按订阅计费（小任务实测约 0.1~0.2 美元）。',
        '- 琐碎小问不派；一个"完整子任务"才派。',
        '',
        '## 参数覆盖',
        '- cwd（工作目录）、model（sonnet/opus/haiku）、permissionMode（默认 acceptEdits）、maxTurns、resume。',
        '',
        '## 插件维护（改 dsh-claude-code 本身）',
        '- 改完源码：npm run build，再按安装方式重新部署（本地：cp -R 覆盖 profile node_modules 下的 dsh-claude-code），最后重启 dsh。',
    ].join("\n"),
};
async function runClaude(task, opts) {
    let output = '';
    let sessionId = '';
    let costUsd = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    const toolsUsed = new Set();
    let error;
    const q = query({
        prompt: task,
        options: {
            cwd: opts.cwd,
            model: opts.model,
            permissionMode: opts.permissionMode,
            maxTurns: opts.maxTurns,
            allowedTools: opts.allowedTools,
            pathToClaudeCodeExecutable: opts.pathToClaudeCodeExecutable,
            resume: opts.resume,
            abortController: opts.abort,
            env: { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: 'dsh-claude-code/0.1.0' },
        },
    });
    for await (const msg of q) {
        if (msg.type === 'assistant') {
            sessionId = msg.session_id;
            if (msg.error)
                error = msg.error;
            for (const block of msg.message.content) {
                if (block.type === 'text')
                    output += block.text;
                else if (block.type === 'tool_use')
                    toolsUsed.add(block.name);
            }
        }
        else if (msg.type === 'result') {
            sessionId = msg.session_id;
            if (msg.subtype === 'success') {
                costUsd = typeof msg.total_cost_usd === 'number' ? msg.total_cost_usd : 0;
                const usage = msg.usage;
                if (usage) {
                    inputTokens = Number(usage.input_tokens ?? 0);
                    outputTokens = Number(usage.output_tokens ?? 0);
                }
                if (!output.trim() && typeof msg.result === 'string')
                    output = msg.result;
            }
            else {
                const detail = msg.result ?? msg.error ?? msg.subtype;
                error = typeof detail === 'string' ? detail : JSON.stringify(detail);
            }
        }
    }
    if (error)
        throw new Error('claude_code failed: ' + error);
    if (!output.trim())
        throw new Error('claude_code returned no output');
    return {
        output: output.trim(),
        sessionId,
        costUsd,
        inputTokens,
        outputTokens,
        toolsUsed: [...toolsUsed],
    };
}
export function apply(ctx, config) {
    ctx.skills.register(DELEGATION_SKILL);
    ctx.tools.register(defineTool({
        name: 'claude_code',
        description: "Delegate one self-contained coding task to your local Claude Code (running on your Claude subscription) " +
            "and return its final result text. Use it for a well-scoped subtask that benefits from Claude Code's own " +
            "agent loop and tools; give it everything it needs (goal, files, constraints) in the task string. " +
            "To continue a previous delegation with its remembered context, pass the sessionId you received earlier " +
            "as resume. This is a slow, expensive call; prefer it only when the work is genuinely self-contained.",
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
                description: "Override Claude Code permission mode for this call (acceptEdits is the default).",
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
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    ok: { type: 'boolean', required: true },
                    output: { type: 'string', required: true },
                    sessionId: { type: 'string', required: true },
                    costUsd: { type: 'number', required: true },
                    inputTokens: { type: 'integer', required: true },
                    outputTokens: { type: 'integer', required: true },
                    toolsUsed: { type: 'array', required: true, items: { type: 'string' } },
                },
            },
            render: (_args, value) => [{ type: 'text', text: value.output }],
        },
        timeoutMs: config.timeoutMs,
        async execute(args, exec) {
            const abort = new AbortController();
            const onAbort = () => abort.abort();
            exec.signal.addEventListener('abort', onAbort, { once: true });
            try {
                const outcome = await runClaude(args.task, {
                    cwd: args.cwd ?? config.cwd ?? process.cwd(),
                    model: args.model ?? config.model,
                    permissionMode: args.permissionMode ?? config.permissionMode,
                    maxTurns: args.maxTurns ?? config.maxTurns,
                    allowedTools: args.allowedTools ?? config.allowedTools,
                    pathToClaudeCodeExecutable: config.pathToClaudeCodeExecutable,
                    resume: args.resume,
                    abort,
                });
                return {
                    ok: true,
                    output: outcome.output,
                    sessionId: outcome.sessionId,
                    costUsd: outcome.costUsd,
                    inputTokens: outcome.inputTokens,
                    outputTokens: outcome.outputTokens,
                    toolsUsed: outcome.toolsUsed,
                };
            }
            finally {
                exec.signal.removeEventListener('abort', onAbort);
            }
        },
        presentCall: (args) => ({
            card: 'generic',
            title: 'Claude Code',
            kind: 'other',
            rawInput: { task: typeof args.task === 'string' ? args.task.slice(0, 200) : args.task },
        }),
    }));
}
