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
    readonly list: "ccp-list";
    readonly listTitle: "ccp-listTitle";
    readonly row: "ccp-row";
    readonly rowActive: "ccp-rowActive";
    readonly rowHead: "ccp-rowHead";
    readonly rowLabel: "ccp-rowLabel";
    readonly rowMeta: "ccp-rowMeta";
    readonly dot: "ccp-dot";
    readonly pane: "ccp-pane";
    readonly paneHead: "ccp-paneHead";
    readonly paneTitle: "ccp-paneTitle";
    readonly stats: "ccp-stats";
    readonly stat: "ccp-stat";
    readonly output: "ccp-output";
    readonly outputBody: "ccp-outputBody";
    readonly outputLine: "ccp-outputLine";
    readonly outputTool: "ccp-outputTool";
    readonly outputNotice: "ccp-outputNotice";
    readonly follow: "ccp-follow";
    readonly actions: "ccp-actions";
    readonly button: "ccp-button";
    readonly danger: "ccp-danger";
    readonly empty: "ccp-empty";
    readonly emptyTitle: "ccp-emptyTitle";
    readonly error: "ccp-error";
    readonly mono: "ccp-mono";
};
/** Install the stylesheet once; safe to call on every activation. */
export declare function installStyles(): void;
