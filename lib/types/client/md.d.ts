export interface MarkdownProps {
    /** Raw Markdown source; rendered as-is when it cannot be parsed. */
    text: string;
}
/**
 * Render Markdown source as React elements.
 *
 * Memoised because the panel re-renders the whole event list on every poll
 * tick while a delegation runs, and the source text of an already-emitted
 * block never changes — so each block is parsed exactly once.
 */
export declare const Markdown: import("react").NamedExoticComponent<MarkdownProps>;
