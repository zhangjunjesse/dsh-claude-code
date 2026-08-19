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
  list: 'ccp-list',
  listTitle: 'ccp-listTitle',
  row: 'ccp-row',
  rowActive: 'ccp-rowActive',
  rowHead: 'ccp-rowHead',
  rowLabel: 'ccp-rowLabel',
  rowMeta: 'ccp-rowMeta',
  dot: 'ccp-dot',
  pane: 'ccp-pane',
  paneHead: 'ccp-paneHead',
  paneTitle: 'ccp-paneTitle',
  stats: 'ccp-stats',
  stat: 'ccp-stat',
  output: 'ccp-output',
  outputBody: 'ccp-outputBody',
  outputLine: 'ccp-outputLine',
  outputTool: 'ccp-outputTool',
  outputNotice: 'ccp-outputNotice',
  follow: 'ccp-follow',
  actions: 'ccp-actions',
  button: 'ccp-button',
  danger: 'ccp-danger',
  empty: 'ccp-empty',
  emptyTitle: 'ccp-emptyTitle',
  error: 'ccp-error',
  mono: 'ccp-mono',
} as const

const STYLE_ID = 'dsh-claude-code-panel'

const CSS_TEXT = `
.ccp-root {
  --ccp-composer-clearance: 148px;
  box-sizing: border-box;
  display: flex;
  gap: 12px;
  height: 100%;
  min-height: 0;
  padding: 12px 16px var(--ccp-composer-clearance);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
}
.ccp-root * { box-sizing: border-box; }
.ccp-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: none;
  width: 260px;
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
}
.ccp-listTitle {
  flex: none;
  padding: 2px 6px 6px;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}
.ccp-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  padding: 7px 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.ccp-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.ccp-rowActive {
  background: var(--dsw-alias-fill-l2);
  border-color: var(--dsw-alias-border-l2);
}
.ccp-rowHead { display: flex; align-items: center; gap: 6px; min-width: 0; }
.ccp-rowLabel {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.ccp-rowMeta {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 14px;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}
.ccp-dot { flex: none; }
.ccp-pane {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.ccp-paneHead { display: flex; flex-direction: column; gap: 4px; flex: none; }
.ccp-paneTitle { font-size: 14px; line-height: 20px; font-weight: 500; }
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
