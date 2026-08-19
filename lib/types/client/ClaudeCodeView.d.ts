import type { ClaudeCodeApi } from './api.js';
import type { ViewProps } from './types.js';
/**
 * Build the view component bound to one API surface. The connection service is
 * only reachable from the plugin context, so the binding happens at
 * registration time instead of through a prop.
 */
export declare function createClaudeCodeView(api: ClaudeCodeApi): ({ sessionId, useSessions }: ViewProps) => import("react").JSX.Element;
