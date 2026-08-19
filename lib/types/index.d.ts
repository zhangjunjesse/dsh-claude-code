import { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export declare const name = "claude-code";
export declare const inject: string[];
export interface SubagentConfig {
    description: string;
    prompt: string;
    tools?: string[];
    disallowedTools?: string[];
    model?: string;
    maxTurns?: number;
    initialPrompt?: string;
    background?: boolean;
}
export interface Config {
    model: string;
    permissionMode: string;
    maxTurns: number;
    timeoutMs: number;
    cwd?: string;
    allowedTools?: string[];
    pathToClaudeCodeExecutable?: string;
    effort?: string;
    maxThinkingTokens?: number;
    thinkingMode?: 'adaptive' | 'disabled';
    maxBudgetUsd?: number;
    appendSystemPrompt?: string;
    allowDangerouslySkipPermissions: boolean;
    proxy?: string;
    subagents?: Record<string, SubagentConfig>;
}
export declare const Config: z<Config>;
export declare function apply(ctx: Context, config: Config): void;
