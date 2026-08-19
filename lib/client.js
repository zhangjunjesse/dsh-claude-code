window.__ModuleLoader__.load({
	id: "dsh-claude-code",
	factory: (require) => {
var module = { exports: {} };
var exports = module.exports;

"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/api.ts
var ClaudeCodeApiError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "ClaudeCodeApiError";
  }
};
function isResult(value) {
  return typeof value === "object" && value !== null && "ok" in value;
}
function text(value) {
  return typeof value === "string" ? value : "";
}
function toEvent(raw) {
  if (typeof raw !== "object" || raw === null) return null;
  const event = raw;
  switch (event["type"]) {
    case "text":
      return { type: "text", text: text(event["text"]) };
    case "thinking":
      return {
        type: "thinking",
        thinking: text(event["thinking"]),
        ...typeof event["signature"] === "string" ? { signature: event["signature"] } : {}
      };
    case "tool_use":
      return {
        type: "tool_use",
        ...typeof event["id"] === "string" ? { id: event["id"] } : {},
        name: text(event["name"]) || "tool",
        input: event["input"]
      };
    case "tool_result":
      return {
        type: "tool_result",
        tool_use_id: typeof event["tool_use_id"] === "string" ? event["tool_use_id"] : null,
        content: text(event["content"]),
        ...event["isError"] === true ? { isError: true } : {}
      };
    case "result":
      return {
        type: "result",
        text: text(event["text"]),
        ...typeof event["costUsd"] === "number" ? { costUsd: event["costUsd"] } : {},
        ...typeof event["numTurns"] === "number" ? { numTurns: event["numTurns"] } : {},
        ...typeof event["durationMs"] === "number" ? { durationMs: event["durationMs"] } : {},
        ...event["isError"] === true ? { isError: true } : {}
      };
    default:
      return null;
  }
}
function createApi(connection) {
  async function call(method, args, signal) {
    let raw;
    try {
      raw = await connection.rpc.call("/api", `claudeCode/${method}`, { args }, signal);
    } catch (error) {
      throw new ClaudeCodeApiError("network", error instanceof Error ? error.message : String(error));
    }
    if (!isResult(raw)) throw new ClaudeCodeApiError("protocol", `malformed response for claudeCode/${method}`);
    if (!raw.ok) throw new ClaudeCodeApiError(raw.error?.code ?? "internal", raw.error?.message ?? `claudeCode/${method} failed`);
    return raw.value;
  }
  return {
    listJobs: (sessionId, signal) => call("listJobs", { sessionId }, signal),
    readOutput: (sessionId, jobId, fromOffset, signal) => call("readOutput", { sessionId, jobId, fromOffset }, signal),
    readEvents: async (sessionId, jobId, fromOffset, signal) => {
      const raw = await call(
        "readEvents",
        { sessionId, jobId, fromOffset },
        signal
      );
      const events = [];
      if (Array.isArray(raw.events)) {
        for (const item of raw.events) {
          const event = toEvent(item);
          if (event !== null) events.push(event);
        }
      }
      return {
        events,
        nextOffset: typeof raw.nextOffset === "number" ? raw.nextOffset : fromOffset,
        truncated: raw.truncated === true,
        status: raw.status ?? "running"
      };
    },
    cancel: (sessionId, jobId) => call("cancel", { sessionId, jobId })
  };
}

// src/client/ClaudeCodeView.tsx
var import_react3 = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/EventView.tsx
var import_react = require("react");

// src/client/styles.ts
var CSS = {
  root: "ccp-root",
  list: "ccp-list",
  listTitle: "ccp-listTitle",
  row: "ccp-row",
  rowActive: "ccp-rowActive",
  rowHead: "ccp-rowHead",
  rowLabel: "ccp-rowLabel",
  rowMeta: "ccp-rowMeta",
  dot: "ccp-dot",
  pane: "ccp-pane",
  paneHead: "ccp-paneHead",
  paneTitle: "ccp-paneTitle",
  stats: "ccp-stats",
  stat: "ccp-stat",
  output: "ccp-output",
  outputBody: "ccp-outputBody",
  outputLine: "ccp-outputLine",
  outputTool: "ccp-outputTool",
  outputNotice: "ccp-outputNotice",
  events: "ccp-events",
  eventsBody: "ccp-eventsBody",
  evText: "ccp-evText",
  evThinking: "ccp-evThinking",
  evThinkingHead: "ccp-evThinkingHead",
  evThinkingBody: "ccp-evThinkingBody",
  evTool: "ccp-evTool",
  evToolHead: "ccp-evToolHead",
  evToolBadge: "ccp-evToolBadge",
  evToolParams: "ccp-evToolParams",
  evToolParamsFull: "ccp-evToolParamsFull",
  evToolResult: "ccp-evToolResult",
  evToolResultHead: "ccp-evToolResultHead",
  evToolResultBody: "ccp-evToolResultBody",
  evToolError: "ccp-evToolError",
  evResult: "ccp-evResult",
  evWarning: "ccp-evWarning",
  evMore: "ccp-evMore",
  follow: "ccp-follow",
  actions: "ccp-actions",
  button: "ccp-button",
  danger: "ccp-danger",
  empty: "ccp-empty",
  emptyTitle: "ccp-emptyTitle",
  error: "ccp-error",
  mono: "ccp-mono"
};
var TOOL_TONES = 6;
function toolToneClass(name) {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = hash * 31 + name.charCodeAt(index) >>> 0;
  }
  return `ccp-evTone${hash % TOOL_TONES}`;
}
var STYLE_ID = "dsh-claude-code-panel";
var CSS_TEXT = `
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
.ccp-evText {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-primary);
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
`;
function installStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID) !== null) return;
  const tag = document.createElement("style");
  tag.id = STYLE_ID;
  tag.dataset["plugin"] = "dsh-claude-code";
  tag.textContent = CSS_TEXT;
  document.head.appendChild(tag);
}

// src/client/locales.ts
var zh = {
  "view.label": "Claude Code",
  "list.title": "\u59D4\u6D3E\u4EFB\u52A1",
  "list.empty.title": "\u6682\u65E0 Claude Code \u59D4\u6D3E\u4EFB\u52A1",
  "list.empty.hint": "\u5728\u5BF9\u8BDD\u91CC\u8BA9\u6211\u7528 run_in_background: true \u6D3E\u4E00\u4E2A\u8BD5\u8BD5\u3002",
  "list.empty.note": "\u4EFB\u52A1\u53EA\u5B58\u5728\u4E8E\u5F53\u524D DSH \u8FDB\u7A0B\u5185\uFF0C\u91CD\u542F\u540E\u5217\u8868\u4E3A\u7A7A\uFF1B\u5386\u53F2\u7ED3\u679C\u770B\u5BF9\u8BDD\u91CC\u7684\u5DE5\u5177\u5361\u7247\u3002",
  "status.running": "\u8FD0\u884C\u4E2D",
  "status.completed": "\u5DF2\u5B8C\u6210",
  "status.failed": "\u5DF2\u5931\u8D25",
  "status.killed": "\u5DF2\u53D6\u6D88",
  "detail.job": "\u4EFB\u52A1 id",
  "detail.session": "Claude \u4F1A\u8BDD",
  "detail.session.hint": "\u4F5C\u4E3A resume \u53C2\u6570\u53EF\u7EED\u63A5\u8BE5\u4F1A\u8BDD",
  "stats.turns": "\u8F6E",
  "stats.cost": "\u8D39\u7528",
  "stats.duration": "\u8017\u65F6",
  "action.cancel": "\u53D6\u6D88",
  "action.cancel.confirm": "\u786E\u5B9A\u53D6\u6D88\u8FD9\u4E2A\u4EFB\u52A1\uFF1FClaude Code \u4F1A\u88AB\u4E2D\u6B62\u3002",
  "action.copyOutput": "\u590D\u5236\u8F93\u51FA",
  "action.copySession": "\u590D\u5236\u4F1A\u8BDD id",
  "action.copied": "\u5DF2\u590D\u5236",
  "output.title": "\u5B9E\u65F6\u8F93\u51FA",
  "output.empty": "\u8FD8\u6CA1\u6709\u8F93\u51FA\u2026",
  "output.truncated": "\u2026\u66F4\u65E9\u7684\u8F93\u51FA\u5DF2\u88AB\u622A\u65AD\u2026",
  "output.follow": "\u2193 \u56DE\u5230\u5E95\u90E8",
  "output.collapse": "\u6536\u8D77",
  "output.expand": "\u5C55\u5F00",
  "events.title": "Claude Code \u8F93\u51FA",
  "events.empty": "\u8FD8\u6CA1\u6709\u8F93\u51FA\u2026",
  "events.truncated": "\u2026\u66F4\u65E9\u7684\u4E8B\u4EF6\u5DF2\u88AB\u622A\u65AD\u2026",
  "events.thinking": "\u{1F4AD} \u601D\u8003\u4E2D\u2026\uFF08\u70B9\u51FB\u5C55\u5F00\uFF09",
  "events.thinkingLabel": "\u601D\u8003",
  "events.toolResult": "\u7ED3\u679C",
  "events.toolError": "\u51FA\u9519",
  "events.result": "\u5B8C\u6210",
  "error.prefix": "\u8BFB\u53D6\u5931\u8D25",
  "select.empty": "\u9009\u62E9\u5DE6\u8FB9\u7684\u4EFB\u52A1\u67E5\u770B\u8F93\u51FA"
};
var en = {
  "view.label": "Claude Code",
  "list.title": "Delegations",
  "list.empty.title": "No Claude Code delegations yet",
  "list.empty.hint": "Ask me to delegate one with run_in_background: true.",
  "list.empty.note": "Jobs live only inside the current DSH process; the list is empty after a restart. Past results stay in the conversation tool cards.",
  "status.running": "running",
  "status.completed": "completed",
  "status.failed": "failed",
  "status.killed": "cancelled",
  "detail.job": "job id",
  "detail.session": "Claude session",
  "detail.session.hint": "pass it back as resume to continue this session",
  "stats.turns": "turns",
  "stats.cost": "cost",
  "stats.duration": "took",
  "action.cancel": "Cancel",
  "action.cancel.confirm": "Cancel this job? Claude Code will be aborted.",
  "action.copyOutput": "Copy output",
  "action.copySession": "Copy session id",
  "action.copied": "Copied",
  "output.title": "Live output",
  "output.empty": "No output yet\u2026",
  "output.truncated": "\u2026earlier output truncated\u2026",
  "output.follow": "\u2193 Back to bottom",
  "output.collapse": "Collapse",
  "output.expand": "Expand",
  "events.title": "Claude Code output",
  "events.empty": "No output yet\u2026",
  "events.truncated": "\u2026earlier events truncated\u2026",
  "events.thinking": "\u{1F4AD} Thinking\u2026 (click to expand)",
  "events.thinkingLabel": "Thinking",
  "events.toolResult": "Result",
  "events.toolError": "Error",
  "events.result": "Completed",
  "error.prefix": "Read failed",
  "select.empty": "Pick a job on the left to see its output"
};
function isChinese() {
  const documentLang = typeof document !== "undefined" ? document.documentElement.lang : "";
  const navigatorLang = typeof navigator !== "undefined" ? navigator.language : "";
  const lang = (documentLang || navigatorLang || "zh").toLowerCase();
  return lang.startsWith("zh") || lang === "";
}
function t(key) {
  return (isChinese() ? zh : en)[key];
}

// src/client/EventView.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var MAX_RENDER_EVENTS = 1e3;
var PARAM_PREVIEW = 200;
var RESULT_PREVIEW = 800;
var STICKY_SLACK_PX = 24;
function formatInput(input) {
  if (input === void 0 || input === null) return { preview: "", full: "" };
  if (typeof input === "string") return { preview: input, full: input };
  let compact;
  let full;
  try {
    compact = JSON.stringify(input) ?? String(input);
    full = JSON.stringify(input, null, 2) ?? String(input);
  } catch {
    compact = String(input);
    full = compact;
  }
  return { preview: compact, full };
}
function formatDuration(durationMs) {
  const total = Math.max(0, Math.floor(durationMs / 1e3));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}m${seconds}s` : `${seconds}s`;
}
function resultSummary(event) {
  const parts = [event.isError === true ? `\u274C ${t("status.failed")}` : `\u2705 ${t("events.result")}`];
  if (typeof event.costUsd === "number") parts.push(`$${event.costUsd.toFixed(2)}`);
  if (typeof event.numTurns === "number") parts.push(`${event.numTurns} turns`);
  if (typeof event.durationMs === "number") parts.push(formatDuration(event.durationMs));
  return parts.join(" \xB7 ");
}
function toNodes(events) {
  const nodes = [];
  const byToolUse = /* @__PURE__ */ new Map();
  events.forEach((event, index) => {
    const key = `e${index}`;
    switch (event.type) {
      case "text": {
        if (event.text.trim() === "") break;
        nodes.push({ kind: "text", key, text: event.text });
        break;
      }
      case "thinking": {
        nodes.push({ kind: "thinking", key, thinking: event.thinking });
        break;
      }
      case "tool_use": {
        const { preview, full } = formatInput(event.input);
        nodes.push({ kind: "tool", key, name: event.name, preview, full, results: [] });
        if (event.id !== void 0) byToolUse.set(event.id, nodes.length - 1);
        break;
      }
      case "tool_result": {
        const result = { content: event.content, isError: event.isError === true };
        const at = event.tool_use_id === null ? void 0 : byToolUse.get(event.tool_use_id);
        const owner = at === void 0 ? void 0 : nodes[at];
        if (owner !== void 0 && owner.kind === "tool") owner.results.push(result);
        else nodes.push({ kind: "orphanResult", key, result });
        break;
      }
      case "result": {
        nodes.push({ kind: "result", key, summary: resultSummary(event), isError: event.isError === true });
        break;
      }
      case "warning": {
        nodes.push({ kind: "warning", key, text: event.text });
        break;
      }
    }
  });
  return nodes;
}
function EventView({ events, truncated, jobId }) {
  const bodyRef = (0, import_react.useRef)(null);
  const [following, setFollowing] = (0, import_react.useState)(true);
  const [expanded, setExpanded] = (0, import_react.useState)(() => /* @__PURE__ */ new Set());
  const clipped = events.length > MAX_RENDER_EVENTS;
  const visible = (0, import_react.useMemo)(
    () => clipped ? events.slice(events.length - MAX_RENDER_EVENTS) : events,
    [events, clipped]
  );
  const nodes = (0, import_react.useMemo)(() => toNodes(visible), [visible]);
  (0, import_react.useEffect)(() => {
    setFollowing(true);
    setExpanded(/* @__PURE__ */ new Set());
  }, [jobId]);
  (0, import_react.useLayoutEffect)(() => {
    const body = bodyRef.current;
    if (!body || !following) return;
    body.scrollTop = body.scrollHeight;
  }, [nodes, following]);
  const onScroll = () => {
    const body = bodyRef.current;
    if (!body) return;
    const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight <= STICKY_SLACK_PX;
    setFollowing(atBottom);
  };
  const backToBottom = () => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
    setFollowing(true);
  };
  const toggle = (key) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const renderResult = (key, result) => {
    const open = expanded.has(key);
    const long = result.content.length > RESULT_PREVIEW;
    const body = open || !long ? result.content : `${result.content.slice(0, RESULT_PREVIEW)}\u2026`;
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: CSS.evToolResult, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: result.isError ? `${CSS.evToolResultHead} ${CSS.evToolError}` : CSS.evToolResultHead, children: result.isError ? t("events.toolError") : t("events.toolResult") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { className: result.isError ? `${CSS.evToolResultBody} ${CSS.evToolError}` : CSS.evToolResultBody, children: body }),
      long ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: CSS.evMore, onClick: () => {
        toggle(key);
      }, children: open ? t("output.collapse") : t("output.expand") }) : null
    ] }, key);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: CSS.events, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { ref: bodyRef, className: CSS.eventsBody, onScroll, role: "log", "aria-label": t("events.title"), children: [
      truncated || clipped ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: CSS.outputNotice, children: t("events.truncated") }) : null,
      nodes.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: CSS.outputNotice, children: t("events.empty") }) : null,
      nodes.map((node) => {
        if (node.kind === "text") {
          return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: CSS.evText, children: node.text }, node.key);
        }
        if (node.kind === "thinking") {
          const open2 = expanded.has(node.key);
          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: CSS.evThinking, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                className: CSS.evThinkingHead,
                "aria-expanded": open2,
                onClick: () => {
                  toggle(node.key);
                },
                children: open2 ? `\u{1F4AD} ${t("events.thinkingLabel")}\uFF08${t("output.collapse")}\uFF09` : t("events.thinking")
              }
            ),
            open2 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { className: CSS.evThinkingBody, children: node.thinking }) : null
          ] }, node.key);
        }
        if (node.kind === "orphanResult") {
          return renderResult(`${node.key}:r0`, node.result);
        }
        if (node.kind === "result") {
          return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: node.isError ? `${CSS.evResult} ${CSS.evToolError}` : CSS.evResult, children: node.summary }, node.key);
        }
        if (node.kind === "warning") {
          return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { role: "status", className: CSS.evWarning, children: node.text }, node.key);
        }
        const paramsKey = `${node.key}:p`;
        const open = expanded.has(paramsKey);
        const long = node.preview.length > PARAM_PREVIEW;
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: CSS.evTool, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "button",
            {
              type: "button",
              className: CSS.evToolHead,
              "aria-expanded": open,
              onClick: () => {
                toggle(paramsKey);
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${CSS.evToolBadge} ${toolToneClass(node.name)}`, children: [
                  "[",
                  node.name,
                  "]"
                ] }),
                open ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: CSS.evToolParams, children: long ? `${node.preview.slice(0, PARAM_PREVIEW)}\u2026` : node.preview })
              ]
            }
          ),
          open && node.full !== "" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { className: CSS.evToolParamsFull, children: node.full }) : null,
          node.results.map((result, index) => renderResult(`${node.key}:r${index}`, result))
        ] }, node.key);
      })
    ] }),
    following ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: CSS.follow, onClick: backToBottom, children: t("output.follow") })
  ] });
}

// src/client/OutputView.tsx
var import_react2 = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
var MAX_CHARS = 5e5;
var MAX_LINES = 2e3;
var STICKY_SLACK_PX2 = 24;
function toLines(text2) {
  let body = text2;
  let clipped = false;
  if (body.length > MAX_CHARS) {
    body = body.slice(body.length - MAX_CHARS);
    clipped = true;
  }
  let lines = body.split("\n");
  if (lines.length > MAX_LINES) {
    lines = lines.slice(lines.length - MAX_LINES);
    clipped = true;
  }
  return { lines, clipped };
}
function OutputView({ text: text2, truncated, jobId }) {
  const bodyRef = (0, import_react2.useRef)(null);
  const [following, setFollowing] = (0, import_react2.useState)(true);
  const { lines, clipped } = (0, import_react2.useMemo)(() => toLines(text2), [text2]);
  (0, import_react2.useEffect)(() => {
    setFollowing(true);
  }, [jobId]);
  (0, import_react2.useLayoutEffect)(() => {
    const body = bodyRef.current;
    if (!body || !following) return;
    body.scrollTop = body.scrollHeight;
  }, [lines, following]);
  const onScroll = () => {
    const body = bodyRef.current;
    if (!body) return;
    const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight <= STICKY_SLACK_PX2;
    setFollowing(atBottom);
  };
  const backToBottom = () => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
    setFollowing(true);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: CSS.output, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { ref: bodyRef, className: CSS.outputBody, onScroll, role: "log", "aria-label": t("output.title"), children: [
      truncated || clipped ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: CSS.outputNotice, children: [
        t("output.truncated"),
        "\n"
      ] }) : null,
      text2 === "" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: CSS.outputNotice, children: t("output.empty") }) : null,
      lines.map((line, index) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        "span",
        {
          className: line.startsWith("[tool] ") ? CSS.outputTool : CSS.outputLine,
          children: [
            line,
            index === lines.length - 1 ? "" : "\n"
          ]
        },
        index
      ))
    ] }),
    following ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: CSS.follow, onClick: backToBottom, children: t("output.follow") })
  ] });
}

// src/client/ClaudeCodeView.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
var NO_JOBS = [];
var JOB_KIND = "claude-code";
var POLL_MS = 1e3;
var MAX_CACHED_SESSIONS = 8;
var panels = /* @__PURE__ */ new Map();
function panelOf(sessionId) {
  let panel = panels.get(sessionId);
  if (panel === void 0) {
    panel = { outputs: /* @__PURE__ */ new Map(), events: /* @__PURE__ */ new Map() };
    panels.set(sessionId, panel);
    while (panels.size > MAX_CACHED_SESSIONS) {
      const oldest = panels.keys().next();
      if (oldest.done === true) break;
      panels.delete(oldest.value);
    }
  }
  return panel;
}
function isLive(job) {
  return job.status === "running" || job.status === "stopping";
}
function ordered(jobs) {
  return [...jobs].sort((left, right) => {
    const liveLeft = isLive(left);
    if (liveLeft !== isLive(right)) return liveLeft ? -1 : 1;
    if (liveLeft) return left.startedAt - right.startedAt;
    const finished = (right.finishedAt ?? right.startedAt) - (left.finishedAt ?? left.startedAt);
    return finished !== 0 ? finished : left.startedAt - right.startedAt;
  });
}
function dotState(status) {
  switch (status) {
    case "running":
      return "ongoing";
    case "stopping":
      return "warning";
    case "killed":
      return "warning";
    case "completed":
      return "done";
    default:
      return "error";
  }
}
function statusLabel(status) {
  const key = status === "completed" ? "status.completed" : status === "failed" ? "status.failed" : status === "running" ? "status.running" : "status.killed";
  return t(key);
}
function formatDuration2(elapsedMs) {
  const total = Math.max(0, Math.floor(elapsedMs / 1e3));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
function defaultSelection(rows) {
  const running = rows.filter(isLive);
  if (running.length) return running[running.length - 1]?.id;
  return rows[0]?.id;
}
async function copy(text2) {
  try {
    await navigator.clipboard.writeText(text2);
    return true;
  } catch {
    return false;
  }
}
function createClaudeCodeView(api) {
  return function ClaudeCodeView({ sessionId, useSessions }) {
    const mirrored = useSessions((state) => state.jobsBySession?.[sessionId]) ?? NO_JOBS;
    const rows = (0, import_react3.useMemo)(() => ordered(mirrored.filter((job) => job.kind === JOB_KIND)), [mirrored]);
    const panel = panelOf(sessionId);
    const [selected, setSelected] = (0, import_react3.useState)(() => panel.selected ?? defaultSelection(rows));
    const [meta, setMeta] = (0, import_react3.useState)({});
    const [error, setError] = (0, import_react3.useState)(null);
    const [now, setNow] = (0, import_react3.useState)(() => Date.now());
    const [copied, setCopied] = (0, import_react3.useState)(null);
    const [revision, setRevision] = (0, import_react3.useState)(0);
    const bumpRef = (0, import_react3.useRef)(() => {
      setRevision((value) => value + 1);
    });
    (0, import_react3.useEffect)(() => {
      const stillThere = selected !== void 0 && rows.some((job) => job.id === selected);
      const next = stillThere ? selected : defaultSelection(rows);
      if (next !== selected) setSelected(next);
      panel.selected = next;
    }, [rows, selected, panel]);
    const current = rows.find((job) => job.id === selected);
    const currentStatus = current?.status;
    const lifecycle = rows.map((job) => `${job.id}:${job.status}`).join(",");
    (0, import_react3.useEffect)(() => {
      const abort = new AbortController();
      api.listJobs(sessionId, abort.signal).then(
        (jobs) => {
          const next = {};
          for (const job of jobs) next[job.jobId] = job;
          setMeta(next);
          setError(null);
        },
        (failure) => {
          if (abort.signal.aborted) return;
          setError(`${t("error.prefix")}: ${failure instanceof Error ? failure.message : String(failure)}`);
        }
      );
      return () => {
        abort.abort();
      };
    }, [sessionId, lifecycle]);
    (0, import_react3.useEffect)(() => {
      if (selected === void 0) return;
      const jobId = selected;
      const abort = new AbortController();
      let timer;
      const onFailure = (failure) => {
        if (abort.signal.aborted) return;
        setError(`${t("error.prefix")}: ${failure instanceof Error ? failure.message : String(failure)}`);
      };
      const pullText = () => {
        const state = panel.outputs.get(jobId) ?? { text: "", offset: 0, truncated: false };
        api.readOutput(sessionId, jobId, state.offset, abort.signal).then(
          (chunk) => {
            if (chunk.text === "" && !chunk.truncated) return;
            panel.outputs.set(jobId, {
              text: state.text + chunk.text,
              offset: chunk.nextOffset,
              truncated: state.truncated || chunk.truncated
            });
            bumpRef.current();
          },
          onFailure
        );
      };
      const pullEvents = () => {
        const state = panel.events.get(jobId) ?? { list: [], offset: 0, truncated: false };
        api.readEvents(sessionId, jobId, state.offset, abort.signal).then(
          (chunk) => {
            if (chunk.events.length === 0 && !chunk.truncated) return;
            panel.events.set(jobId, {
              list: state.list.concat(chunk.events),
              offset: chunk.nextOffset,
              truncated: state.truncated || chunk.truncated
            });
            bumpRef.current();
          },
          onFailure
        );
      };
      const pull = () => {
        pullEvents();
        pullText();
      };
      pull();
      if (currentStatus === "running" || currentStatus === "stopping") {
        timer = setInterval(pull, POLL_MS);
      }
      return () => {
        abort.abort();
        if (timer !== void 0) clearInterval(timer);
      };
    }, [sessionId, selected, currentStatus, panel]);
    const liveCount = rows.filter(isLive).length;
    (0, import_react3.useEffect)(() => {
      if (liveCount === 0) return;
      setNow(Date.now());
      const timer = setInterval(() => {
        setNow(Date.now());
      }, 1e3);
      return () => {
        clearInterval(timer);
      };
    }, [liveCount]);
    const onCancel = (0, import_react3.useCallback)((jobId) => {
      if (!window.confirm(t("action.cancel.confirm"))) return;
      api.cancel(sessionId, jobId).catch((failure) => {
        setError(`${t("error.prefix")}: ${failure instanceof Error ? failure.message : String(failure)}`);
      });
    }, [sessionId]);
    const flashCopied = (0, import_react3.useCallback)((token) => {
      setCopied(token);
      window.setTimeout(() => {
        setCopied((value) => value === token ? null : value);
      }, 1500);
    }, []);
    const detail = current ? meta[current.id] : void 0;
    const output = current ? panel.outputs.get(current.id) : void 0;
    const events = current ? panel.events.get(current.id) : void 0;
    void revision;
    if (rows.length === 0) {
      return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: CSS.root, "data-conversation-composer-overlay": "", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: CSS.empty, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: CSS.emptyTitle, children: t("list.empty.title") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { children: t("list.empty.hint") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { children: t("list.empty.note") })
      ] }) });
    }
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: CSS.root, "data-conversation-composer-overlay": "", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: CSS.list, role: "tablist", "aria-label": t("list.title"), children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: CSS.listTitle, children: t("list.title") }),
        rows.map((job) => {
          const live = isLive(job);
          const elapsed = live ? now - job.startedAt : (job.finishedAt ?? job.startedAt) - job.startedAt;
          return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
            "button",
            {
              type: "button",
              role: "tab",
              "aria-selected": job.id === selected,
              className: job.id === selected ? `${CSS.row} ${CSS.rowActive}` : CSS.row,
              onClick: () => {
                setSelected(job.id);
                panel.selected = job.id;
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: CSS.rowHead, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives.StateDot, { state: dotState(job.status), className: CSS.dot }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: CSS.rowLabel, title: job.label, children: job.label })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: CSS.rowMeta, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: statusLabel(job.status) }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: formatDuration2(elapsed) }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: CSS.mono, children: job.id })
                ] })
              ]
            },
            job.id
          );
        })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: CSS.pane, children: current === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: CSS.empty, children: t("select.empty") }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: CSS.paneHead, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: CSS.paneTitle, title: detail?.task ?? current.label, children: current.label }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: CSS.stats, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: CSS.stat, children: [
              t("detail.job"),
              ": ",
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: CSS.mono, children: current.id })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: CSS.stat, children: statusLabel(current.status) }),
            detail?.numTurns !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: CSS.stat, children: [
              detail.numTurns,
              " ",
              t("stats.turns")
            ] }) : null,
            detail?.costUsd !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: CSS.stat, children: [
              t("stats.cost"),
              " $",
              detail.costUsd.toFixed(4)
            ] }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: CSS.stat, children: [
              t("stats.duration"),
              " ",
              formatDuration2(isLive(current) ? now - current.startedAt : (current.finishedAt ?? current.startedAt) - current.startedAt)
            ] }),
            detail?.claudeSessionId !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: CSS.stat, title: t("detail.session.hint"), children: [
              t("detail.session"),
              ": ",
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: CSS.mono, children: detail.claudeSessionId })
            ] }) : null
          ] }),
          current.detail !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: CSS.stats, children: current.detail }) : null
        ] }),
        error !== null ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: CSS.error, children: error }) : null,
        events !== void 0 && events.list.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          EventView,
          {
            jobId: current.id,
            events: events.list,
            truncated: events.truncated
          }
        ) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          OutputView,
          {
            jobId: current.id,
            text: output?.text ?? (detail?.finalOutput ?? ""),
            truncated: output?.truncated ?? false
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: CSS.actions, children: [
          isLive(current) ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: `${CSS.button} ${CSS.danger}`, onClick: () => {
            onCancel(current.id);
          }, children: t("action.cancel") }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "button",
            {
              type: "button",
              className: CSS.button,
              disabled: (output?.text ?? detail?.finalOutput ?? "") === "",
              onClick: () => {
                void copy(output?.text ?? detail?.finalOutput ?? "").then((done) => {
                  if (done) flashCopied("output");
                });
              },
              children: copied === "output" ? t("action.copied") : t("action.copyOutput")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "button",
            {
              type: "button",
              className: CSS.button,
              disabled: detail?.claudeSessionId === void 0,
              title: t("detail.session.hint"),
              onClick: () => {
                void copy(detail?.claudeSessionId ?? "").then((done) => {
                  if (done) flashCopied("session");
                });
              },
              children: copied === "session" ? t("action.copied") : t("action.copySession")
            }
          )
        ] })
      ] }) })
    ] });
  };
}

// src/client/index.ts
var inject = ["slots", "connection"];
function apply(ctx) {
  installStyles();
  const ClaudeCodeView = createClaudeCodeView(createApi(ctx.connection));
  ctx.slots.inject("conversation.view", () => ctx.slots.register({
    name: "conversation.view",
    id: "claude-code",
    order: 100,
    label: () => t("view.label")
  }, ClaudeCodeView));
}

return module.exports;
}
});

