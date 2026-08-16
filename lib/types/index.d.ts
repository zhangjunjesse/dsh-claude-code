import { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export declare const name = "claude-code";
export declare const inject: string[];
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
}
export declare const Config: z<Config>;
export declare function apply(ctx: Context, config: Config): void;
