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
export const CSS = {
  root: 'ccp-root',
  body: 'ccp-body',
  usage: 'ccp-usage',
  usageHead: 'ccp-usageHead',
  usageToggle: 'ccp-usageToggle',
  usageMini: 'ccp-usageMini',
  usageCaret: 'ccp-usageCaret',
  usageDetail: 'ccp-usageDetail',
  usagePlan: 'ccp-usagePlan',
  usageTier: 'ccp-usageTier',
  usageCache: 'ccp-usageCache',
  usageStale: 'ccp-usageStale',
  usageSpacer: 'ccp-usageSpacer',
  usageBadge: 'ccp-usageBadge',
  usageBadgeNormal: 'ccp-usageBadgeNormal',
  usageBadgeCaution: 'ccp-usageBadgeCaution',
  usageBadgeBlocked: 'ccp-usageBadgeBlocked',
  usageBadgeUnknown: 'ccp-usageBadgeUnknown',
  usageAdvice: 'ccp-usageAdvice',
  usageRefresh: 'ccp-usageRefresh',
  usageBars: 'ccp-usageBars',
  usageRow: 'ccp-usageRow',
  usageRowLabel: 'ccp-usageRowLabel',
  usageTrack: 'ccp-usageTrack',
  usageFill: 'ccp-usageFill',
  usageFillWarn: 'ccp-usageFillWarn',
  usageFillDanger: 'ccp-usageFillDanger',
  usageRowMeta: 'ccp-usageRowMeta',
  usageChips: 'ccp-usageChips',
  usageChipsLabel: 'ccp-usageChipsLabel',
  usageChip: 'ccp-usageChip',
  usageNote: 'ccp-usageNote',
  usageError: 'ccp-usageError',
  tabs: 'ccp-tabs',
  tab: 'ccp-tab',
  tabActive: 'ccp-tabActive',
  tabMain: 'ccp-tabMain',
  tabDot: 'ccp-tabDot',
  tabDotRunning: 'ccp-tabDotRunning',
  tabDotDone: 'ccp-tabDotDone',
  tabDotFailed: 'ccp-tabDotFailed',
  tabDotKilled: 'ccp-tabDotKilled',
  tabLabel: 'ccp-tabLabel',
  tabInfo: 'ccp-tabInfo',
  modalOverlay: 'ccp-modalOverlay',
  modal: 'ccp-modal',
  modalHead: 'ccp-modalHead',
  modalTitle: 'ccp-modalTitle',
  modalClose: 'ccp-modalClose',
  modalBody: 'ccp-modalBody',
  modalRow: 'ccp-modalRow',
  modalKey: 'ccp-modalKey',
  modalValue: 'ccp-modalValue',
  modalTask: 'ccp-modalTask',
  modalFailure: 'ccp-modalFailure',
  modalFoot: 'ccp-modalFoot',
  pane: 'ccp-pane',
  paneHead: 'ccp-paneHead',
  stats: 'ccp-stats',
  stat: 'ccp-stat',
  output: 'ccp-output',
  outputBody: 'ccp-outputBody',
  outputLine: 'ccp-outputLine',
  outputTool: 'ccp-outputTool',
  outputNotice: 'ccp-outputNotice',
  events: 'ccp-events',
  eventsBody: 'ccp-eventsBody',
  evText: 'ccp-evText',
  evTextRaw: 'ccp-evTextRaw',
  md: 'ccp-md',
  mdRaw: 'ccp-mdRaw',
  mdP: 'ccp-mdP',
  mdH1: 'ccp-mdH1',
  mdH2: 'ccp-mdH2',
  mdH3: 'ccp-mdH3',
  mdH4: 'ccp-mdH4',
  mdH5: 'ccp-mdH5',
  mdH6: 'ccp-mdH6',
  mdStrong: 'ccp-mdStrong',
  mdEm: 'ccp-mdEm',
  mdCode: 'ccp-mdCode',
  mdPre: 'ccp-mdPre',
  mdPreCode: 'ccp-mdPreCode',
  mdQuote: 'ccp-mdQuote',
  mdList: 'ccp-mdList',
  mdItem: 'ccp-mdItem',
  mdLink: 'ccp-mdLink',
  mdHr: 'ccp-mdHr',
  evThinking: 'ccp-evThinking',
  evThinkingHead: 'ccp-evThinkingHead',
  evThinkingBody: 'ccp-evThinkingBody',
  evTool: 'ccp-evTool',
  evToolHead: 'ccp-evToolHead',
  evToolBadge: 'ccp-evToolBadge',
  evToolParams: 'ccp-evToolParams',
  evToolParamsFull: 'ccp-evToolParamsFull',
  evToolResult: 'ccp-evToolResult',
  evToolResultHead: 'ccp-evToolResultHead',
  evToolResultBody: 'ccp-evToolResultBody',
  evToolError: 'ccp-evToolError',
  evResult: 'ccp-evResult',
  evWarning: 'ccp-evWarning',
  evMore: 'ccp-evMore',
  follow: 'ccp-follow',
  actions: 'ccp-actions',
  button: 'ccp-button',
  danger: 'ccp-danger',
  empty: 'ccp-empty',
  emptyTitle: 'ccp-emptyTitle',
  error: 'ccp-error',
  mono: 'ccp-mono',
} as const

/** How many tool-badge tints the stylesheet defines. */
const TOOL_TONES = 6

/**
 * Stable tint for one tool name, so `Edit` always reads the same colour within
 * and across runs. A tiny FNV-ish hash keeps it deterministic and dependency-free.
 */
export function toolToneClass(name: string): string {
  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0
  }
  return `ccp-evTone${hash % TOOL_TONES}`
}

const STYLE_ID = 'dsh-claude-code-panel'

const CSS_TEXT = `
.ccp-root {
  --ccp-composer-clearance: 148px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
  padding: 12px 16px var(--ccp-composer-clearance);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
}
.ccp-root * { box-sizing: border-box; }
/* Task tab strip on top, output pane below; the usage bar sits above both. */
.ccp-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
}

/* --- usage bar --- */
.ccp-usage {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: none;
  padding: 3px 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-fill-l1);
}
/* One compact line: nothing here may wrap, so the bar stays 24px tall. */
.ccp-usageHead {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
}
/* The whole line is the expander; the refresh button sits outside it. */
.ccp-usageToggle {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  padding: 2px 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}
.ccp-usageToggle:hover { color: var(--dsw-alias-label-primary); }
.ccp-usageMini {
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.ccp-usageCaret {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
}
.ccp-usageDetail {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 4px;
}
.ccp-usagePlan { font-weight: 600; color: var(--dsw-alias-label-primary); }
.ccp-usageTier { color: var(--dsw-alias-label-secondary); }
.ccp-usageCache {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.ccp-usageStale { color: var(--dsw-alias-state-warning, #c98a2e); }
.ccp-usageSpacer { flex: 1; }
.ccp-usageBadge {
  flex: none;
  padding: 1px 8px;
  border: 1px solid currentColor;
  border-radius: 999px;
  font-size: 11px;
  line-height: 16px;
  font-weight: 600;
}
.ccp-usageBadgeNormal { color: var(--dsw-alias-state-success, #3d9970); }
.ccp-usageBadgeCaution { color: var(--dsw-alias-state-warning, #c98a2e); }
.ccp-usageBadgeBlocked { color: var(--dsw-alias-state-error, #d05353); }
.ccp-usageBadgeUnknown { color: var(--dsw-alias-label-tertiary); }
.ccp-usageAdvice {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}
.ccp-usageRefresh {
  flex: none;
  padding: 1px 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  line-height: 16px;
  cursor: pointer;
}
.ccp-usageRefresh:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.ccp-usageRefresh:disabled { opacity: 0.5; cursor: default; }
.ccp-usageBars { display: flex; flex-direction: column; gap: 4px; }
.ccp-usageRow {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}
.ccp-usageRowLabel { flex: none; width: 56px; }
.ccp-usageTrack {
  flex: 1;
  min-width: 60px;
  height: 6px;
  border-radius: 999px;
  background: var(--dsw-alias-fill-l2);
  overflow: hidden;
}
.ccp-usageFill {
  height: 100%;
  border-radius: 999px;
  background: var(--dsw-alias-state-business-primary);
  transition: width 240ms ease;
}
.ccp-usageFillWarn { background: var(--dsw-alias-state-warning, #c98a2e); }
.ccp-usageFillDanger { background: var(--dsw-alias-state-error, #d05353); }
.ccp-usageRowMeta { flex: none; white-space: nowrap; }
.ccp-usageChips {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 11px;
  line-height: 16px;
}
.ccp-usageChipsLabel { color: var(--dsw-alias-label-tertiary); }
.ccp-usageChip {
  padding: 0 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  background: var(--dsw-alias-fill-l2);
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
}
.ccp-usageNote {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}
.ccp-usageError {
  color: var(--dsw-alias-state-error, #d05353);
  font-size: 11px;
  line-height: 16px;
}
/* --- task tab strip --- */
.ccp-tabs {
  display: flex;
  align-items: stretch;
  gap: 6px;
  flex: none;
  min-width: 0;
  padding-bottom: 4px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}
.ccp-tab {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: none;
  max-width: 200px;
  padding: 0 4px 0 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: var(--dsw-alias-fill-l1);
  transition: background 120ms ease, border-color 120ms ease;
}
.ccp-tab:hover { background: var(--dsw-alias-interactive-bg-hover); }
.ccp-tabActive {
  background: var(--dsw-alias-fill-l2);
  border-color: var(--dsw-alias-state-business-primary);
}
.ccp-tabMain {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 5px 2px;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  text-align: left;
  cursor: pointer;
}
.ccp-tabLabel {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.ccp-tabActive .ccp-tabMain { font-weight: 600; }
.ccp-tabDot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--dsw-alias-label-tertiary);
}
.ccp-tabDotRunning {
  background: var(--dsw-alias-state-info, var(--dsw-alias-state-business-primary, #3b82f6));
  animation: ccp-breathe 1.6s ease-in-out infinite;
}
.ccp-tabDotDone { background: var(--dsw-alias-state-success, #3d9970); }
.ccp-tabDotFailed { background: var(--dsw-alias-state-error, #d05353); }
.ccp-tabDotKilled { background: var(--dsw-alias-label-tertiary); }
@keyframes ccp-breathe {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.78); }
}
.ccp-tabInfo {
  flex: none;
  padding: 0 3px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
.ccp-tabInfo:hover {
  background: var(--dsw-alias-fill-l2);
  color: var(--dsw-alias-state-business-primary);
}

/* --- job detail modal --- */
.ccp-modalOverlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.42);
}
.ccp-modal {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(560px, 90vw);
  max-height: min(72vh, 640px);
  padding: 14px 16px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-specific-menu, var(--dsw-alias-bg-base));
  color: var(--dsw-alias-label-primary);
  box-shadow: var(--dsw-shadow-lv3);
}
.ccp-modalHead { display: flex; align-items: center; gap: 8px; flex: none; }
.ccp-modalTitle { flex: 1; font-size: 14px; line-height: 20px; font-weight: 600; }
.ccp-modalClose {
  flex: none;
  padding: 2px 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
.ccp-modalClose:hover { background: var(--dsw-alias-interactive-bg-hover); }
.ccp-modalBody {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.ccp-modalRow { display: flex; gap: 10px; align-items: baseline; font-size: 12px; line-height: 18px; }
.ccp-modalKey {
  flex: none;
  width: 84px;
  color: var(--dsw-alias-label-tertiary);
}
.ccp-modalValue {
  flex: 1;
  min-width: 0;
  color: var(--dsw-alias-label-secondary);
  word-break: break-word;
  font-variant-numeric: tabular-nums;
}
.ccp-modalTask {
  margin: 0;
  max-height: 220px;
  overflow: auto;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-alias-fill-l1);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
  word-break: break-word;
}
.ccp-modalFailure { color: var(--dsw-alias-state-error, #d05353); }
.ccp-modalFoot { display: flex; flex: none; flex-wrap: wrap; gap: 8px; }
.ccp-pane {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.ccp-paneHead { display: flex; flex-direction: column; gap: 4px; flex: none; }
.ccp-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}
.ccp-stat { white-space: nowrap; }
.ccp-output {
  position: relative;
  flex: 1;
  min-height: 0;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-fill-l1);
  overflow: hidden;
}
.ccp-outputBody {
  height: 100%;
  overflow: auto;
  padding: 10px 12px;
  margin: 0;
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
  word-break: break-word;
}
.ccp-outputLine { display: block; }
.ccp-outputTool {
  display: block;
  font-weight: 600;
  color: var(--dsw-alias-state-business-primary);
}
.ccp-outputNotice { display: block; color: var(--dsw-alias-label-tertiary); }

/* --- structured event stream (native-style rendering) --- */
.ccp-events {
  position: relative;
  flex: 1;
  min-height: 0;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-fill-l1);
  overflow: hidden;
}
.ccp-eventsBody {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  overflow: auto;
  padding: 10px 12px;
}
/* Assistant text is rendered Markdown, so the container is ordinary block flow
   (the block elements md.ts emits own their own spacing) rather than pre-wrap. */
.ccp-evText {
  word-break: break-word;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-primary);
}
.ccp-evTextRaw {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}

/* --- rendered markdown (see md.ts) --- */
.ccp-md {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
/* Fallback when the parser refused the source: show it verbatim. */
.ccp-mdRaw {
  white-space: pre-wrap;
  word-break: break-word;
}
.ccp-mdP { margin: 0; }
.ccp-mdH1, .ccp-mdH2, .ccp-mdH3, .ccp-mdH4, .ccp-mdH5, .ccp-mdH6 {
  margin: 0;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.ccp-mdH1 { font-size: 17px; line-height: 24px; }
.ccp-mdH2 { font-size: 15px; line-height: 22px; }
.ccp-mdH3 { font-size: 14px; line-height: 20px; }
.ccp-mdH4 { font-size: 13px; line-height: 20px; }
.ccp-mdH5 { font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.ccp-mdH6 { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.ccp-mdStrong { font-weight: 600; }
.ccp-mdEm { font-style: italic; }
.ccp-mdCode {
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--dsw-alias-fill-l2);
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 12px;
  word-break: break-word;
}
.ccp-mdPre {
  margin: 0;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-alias-fill-l2);
  overflow-x: auto;
}
.ccp-mdPreCode {
  display: block;
  white-space: pre;
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-primary);
}
.ccp-mdQuote {
  margin: 0;
  padding: 2px 0 2px 10px;
  border-left: 2px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
}
.ccp-mdQuote > * + * { margin-top: 6px; }
/* Not a flex container: flex items lose their list markers. */
.ccp-mdList { margin: 0; padding-left: 20px; }
.ccp-mdItem { margin: 0; }
.ccp-mdItem + .ccp-mdItem { margin-top: 2px; }
.ccp-mdLink {
  color: var(--dsw-alias-state-business-primary);
  text-decoration: underline;
  word-break: break-all;
}
.ccp-mdHr {
  margin: 2px 0;
  border: none;
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.ccp-evThinking {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 8px;
  border-left: 2px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-tertiary);
  font-style: italic;
}
.ccp-evThinkingHead {
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  text-align: left;
  cursor: pointer;
}
.ccp-evThinkingHead:hover { color: var(--dsw-alias-label-secondary); }
.ccp-evThinkingBody {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 12px;
  line-height: 18px;
}
.ccp-evTool {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-alias-fill-l2);
}
.ccp-evToolHead {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.ccp-evToolBadge {
  flex: none;
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 12px;
  line-height: 18px;
  font-weight: 600;
}
.ccp-evTone0 { color: var(--dsw-alias-state-business-primary); }
.ccp-evTone1 { color: var(--dsw-alias-state-success, #3d9970); }
.ccp-evTone2 { color: var(--dsw-alias-state-warning, #c98a2e); }
.ccp-evTone3 { color: var(--dsw-alias-state-error, #d05353); }
.ccp-evTone4 { color: var(--dsw-alias-label-secondary); }
.ccp-evTone5 { color: var(--dsw-alias-state-business-secondary, #7a6ff0); }
.ccp-evToolParams {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}
.ccp-evToolParamsFull {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}
.ccp-evToolResult {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-left: 10px;
  padding-left: 8px;
  border-left: 2px solid var(--dsw-alias-border-l2);
}
.ccp-evToolResultHead {
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}
.ccp-evToolResultBody {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}
.ccp-evToolError { color: var(--dsw-alias-state-error, #d05353); }
.ccp-evWarning {
  padding: 6px 10px;
  border: 1px solid var(--dsw-alias-state-warning, #c98a1f);
  border-radius: 6px;
  background: color-mix(in srgb, var(--dsw-alias-state-warning, #c98a1f) 12%, transparent);
  color: var(--dsw-alias-state-warning, #c98a1f);
  font-size: 12px;
  line-height: 18px;
  font-weight: 600;
}
.ccp-evResult {
  padding: 6px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-alias-fill-l2);
  color: var(--dsw-alias-state-business-primary);
  font-size: 12px;
  line-height: 18px;
  font-variant-numeric: tabular-nums;
}
.ccp-evMore {
  align-self: flex-start;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--dsw-alias-state-business-primary);
  font: inherit;
  font-size: 11px;
  line-height: 16px;
  cursor: pointer;
}
.ccp-evMore:hover { text-decoration: underline; }

.ccp-follow {
  position: absolute;
  right: 12px;
  bottom: 12px;
  padding: 4px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  background: var(--dsw-specific-menu, var(--dsw-alias-bg-base));
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 16px;
  cursor: pointer;
  box-shadow: var(--dsw-shadow-lv3);
}
.ccp-actions { display: flex; flex: none; flex-wrap: wrap; gap: 8px; }
.ccp-button {
  padding: 4px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
.ccp-button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.ccp-button:disabled { opacity: 0.5; cursor: default; }
.ccp-danger { color: var(--dsw-alias-state-error, #d05353); }
.ccp-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  text-align: center;
  color: var(--dsw-alias-label-tertiary);
}
.ccp-emptyTitle { font-size: 14px; color: var(--dsw-alias-label-secondary); }
.ccp-error {
  flex: none;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--dsw-alias-fill-l2);
  color: var(--dsw-alias-state-error, #d05353);
  font-size: 12px;
  line-height: 18px;
}
.ccp-mono {
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
}
`

/** Install the stylesheet once; safe to call on every activation. */
export function installStyles(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID) !== null) return
  const tag = document.createElement('style')
  tag.id = STYLE_ID
  tag.dataset['plugin'] = 'dsh-claude-code'
  tag.textContent = CSS_TEXT
  document.head.appendChild(tag)
}
