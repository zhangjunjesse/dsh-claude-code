export interface OutputViewProps {
    text: string;
    /** True when the host already dropped the head of the buffer. */
    truncated: boolean;
    /** Identity of the job being shown; changing it re-pins the view to the tail. */
    jobId: string;
}
export declare function OutputView({ text, truncated, jobId }: OutputViewProps): import("react").JSX.Element;
