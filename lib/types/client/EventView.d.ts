import type { ClaudeEvent } from './types.js';
export interface EventViewProps {
    events: readonly ClaudeEvent[];
    /** True when the host already dropped the head of the event buffer. */
    truncated: boolean;
    /** Identity of the job being shown; changing it re-pins the view to the tail. */
    jobId: string;
}
export declare function EventView({ events, truncated, jobId }: EventViewProps): import("react").JSX.Element;
