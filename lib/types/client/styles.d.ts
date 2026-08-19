/**
 * Panel stylesheet, injected once per page as a plain `<style>` tag (the same
 * shape the harness's own bundles use for their CSS modules). Every colour is a
 * primitives theme variable so light/dark follow the app; nothing is hardcoded.
 *
 * The root carries `data-conversation-composer-overlay`, which makes the
 * conversation shell stop scrolling the view area and float the composer over
 * the bottom instead — so the panel owns its own scrolling and reserves the
 * composer's height itself (`--ccp-composer-clearance`).
 */
/** Class-name prefix shared by every rule below. */
export declare const CSS: {
    readonly root: "ccp-root";
    readonly body: "ccp-body";
    readonly usage: "ccp-usage";
    readonly usageHead: "ccp-usageHead";
    readonly usageToggle: "ccp-usageToggle";
    readonly usageMini: "ccp-usageMini";
    readonly usageCaret: "ccp-usageCaret";
    readonly usageDetail: "ccp-usageDetail";
    readonly usagePlan: "ccp-usagePlan";
    readonly usageTier: "ccp-usageTier";
    readonly usageCache: "ccp-usageCache";
    readonly usageStale: "ccp-usageStale";
    readonly usageSpacer: "ccp-usageSpacer";
    readonly usageBadge: "ccp-usageBadge";
    readonly usageBadgeNormal: "ccp-usageBadgeNormal";
    readonly usageBadgeCaution: "ccp-usageBadgeCaution";
    readonly usageBadgeBlocked: "ccp-usageBadgeBlocked";
    readonly usageBadgeUnknown: "ccp-usageBadgeUnknown";
    readonly usageAdvice: "ccp-usageAdvice";
    readonly usageRefresh: "ccp-usageRefresh";
    readonly usageBars: "ccp-usageBars";
    readonly usageRow: "ccp-usageRow";
    readonly usageRowLabel: "ccp-usageRowLabel";
    readonly usageTrack: "ccp-usageTrack";
    readonly usageFill: "ccp-usageFill";
    readonly usageFillWarn: "ccp-usageFillWarn";
    readonly usageFillDanger: "ccp-usageFillDanger";
    readonly usageRowMeta: "ccp-usageRowMeta";
    readonly usageChips: "ccp-usageChips";
    readonly usageChipsLabel: "ccp-usageChipsLabel";
    readonly usageChip: "ccp-usageChip";
    readonly usageNote: "ccp-usageNote";
    readonly usageError: "ccp-usageError";
    readonly tabs: "ccp-tabs";
    readonly tab: "ccp-tab";
    readonly tabActive: "ccp-tabActive";
    readonly tabMain: "ccp-tabMain";
    readonly tabDot: "ccp-tabDot";
    readonly tabDotRunning: "ccp-tabDotRunning";
    readonly tabDotDone: "ccp-tabDotDone";
    readonly tabDotFailed: "ccp-tabDotFailed";
    readonly tabDotKilled: "ccp-tabDotKilled";
    readonly tabLabel: "ccp-tabLabel";
    readonly tabInfo: "ccp-tabInfo";
    readonly modalOverlay: "ccp-modalOverlay";
    readonly modal: "ccp-modal";
    readonly modalHead: "ccp-modalHead";
    readonly modalTitle: "ccp-modalTitle";
    readonly modalClose: "ccp-modalClose";
    readonly modalBody: "ccp-modalBody";
    readonly modalRow: "ccp-modalRow";
    readonly modalKey: "ccp-modalKey";
    readonly modalValue: "ccp-modalValue";
    readonly modalTask: "ccp-modalTask";
    readonly modalFailure: "ccp-modalFailure";
    readonly modalFoot: "ccp-modalFoot";
    readonly pane: "ccp-pane";
    readonly paneHead: "ccp-paneHead";
    readonly stats: "ccp-stats";
    readonly stat: "ccp-stat";
    readonly output: "ccp-output";
    readonly outputBody: "ccp-outputBody";
    readonly outputLine: "ccp-outputLine";
    readonly outputTool: "ccp-outputTool";
    readonly outputNotice: "ccp-outputNotice";
    readonly events: "ccp-events";
    readonly eventsBody: "ccp-eventsBody";
    readonly evText: "ccp-evText";
    readonly evTextRaw: "ccp-evTextRaw";
    readonly md: "ccp-md";
    readonly mdRaw: "ccp-mdRaw";
    readonly mdP: "ccp-mdP";
    readonly mdH1: "ccp-mdH1";
    readonly mdH2: "ccp-mdH2";
    readonly mdH3: "ccp-mdH3";
    readonly mdH4: "ccp-mdH4";
    readonly mdH5: "ccp-mdH5";
    readonly mdH6: "ccp-mdH6";
    readonly mdStrong: "ccp-mdStrong";
    readonly mdEm: "ccp-mdEm";
    readonly mdCode: "ccp-mdCode";
    readonly mdPre: "ccp-mdPre";
    readonly mdPreCode: "ccp-mdPreCode";
    readonly mdQuote: "ccp-mdQuote";
    readonly mdList: "ccp-mdList";
    readonly mdItem: "ccp-mdItem";
    readonly mdLink: "ccp-mdLink";
    readonly mdHr: "ccp-mdHr";
    readonly evThinking: "ccp-evThinking";
    readonly evThinkingHead: "ccp-evThinkingHead";
    readonly evThinkingBody: "ccp-evThinkingBody";
    readonly evTool: "ccp-evTool";
    readonly evToolHead: "ccp-evToolHead";
    readonly evToolBadge: "ccp-evToolBadge";
    readonly evToolParams: "ccp-evToolParams";
    readonly evToolParamsFull: "ccp-evToolParamsFull";
    readonly evToolResult: "ccp-evToolResult";
    readonly evToolResultHead: "ccp-evToolResultHead";
    readonly evToolResultBody: "ccp-evToolResultBody";
    readonly evToolError: "ccp-evToolError";
    readonly evResult: "ccp-evResult";
    readonly evWarning: "ccp-evWarning";
    readonly evMore: "ccp-evMore";
    readonly follow: "ccp-follow";
    readonly actions: "ccp-actions";
    readonly button: "ccp-button";
    readonly danger: "ccp-danger";
    readonly empty: "ccp-empty";
    readonly emptyTitle: "ccp-emptyTitle";
    readonly error: "ccp-error";
    readonly mono: "ccp-mono";
};
/**
 * Stable tint for one tool name, so `Edit` always reads the same colour within
 * and across runs. A tiny FNV-ish hash keeps it deterministic and dependency-free.
 */
export declare function toolToneClass(name: string): string;
/** Install the stylesheet once; safe to call on every activation. */
export declare function installStyles(): void;
