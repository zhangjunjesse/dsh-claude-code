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
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}
function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function stringOrNull(value) {
  return typeof value === "string" && value !== "" ? value : null;
}
function toWindow(raw) {
  if (typeof raw !== "object" || raw === null) return null;
  const window2 = raw;
  return {
    utilizationPercent: numberOrNull(window2["utilizationPercent"]),
    resetsAt: stringOrNull(window2["resetsAt"])
  };
}
var ADVICES = ["normal", "caution", "blocked", "unknown"];
function toUsage(raw) {
  const snapshot = record(raw);
  const subscription = record(snapshot["subscription"]);
  const cache = record(snapshot["cache"]);
  const advice = snapshot["advice"];
  const limits = [];
  if (Array.isArray(snapshot["limits"])) {
    for (const item of snapshot["limits"]) {
      if (typeof item !== "object" || item === null) continue;
      const limit = item;
      limits.push({
        kind: stringOrNull(limit["kind"]) ?? "unknown",
        group: stringOrNull(limit["group"]),
        percent: numberOrNull(limit["percent"]),
        severity: stringOrNull(limit["severity"]),
        resetsAt: stringOrNull(limit["resetsAt"]),
        scopeModel: stringOrNull(limit["scopeModel"]),
        isActive: limit["isActive"] === true
      });
    }
  }
  return {
    ok: snapshot["ok"] === true,
    loggedIn: snapshot["loggedIn"] === true,
    error: stringOrNull(snapshot["error"]),
    subscription: {
      type: stringOrNull(subscription["type"]),
      rateLimitTier: stringOrNull(subscription["rateLimitTier"]),
      billingType: stringOrNull(subscription["billingType"])
    },
    fiveHour: toWindow(snapshot["fiveHour"]),
    sevenDay: toWindow(snapshot["sevenDay"]),
    limits,
    advice: ADVICES.includes(advice) ? advice : "unknown",
    cache: {
      fetchedAt: stringOrNull(cache["fetchedAt"]),
      ageMinutes: numberOrNull(cache["ageMinutes"]),
      maybeStale: cache["maybeStale"] === true
    },
    warnings: Array.isArray(snapshot["warnings"]) ? snapshot["warnings"].filter((warning) => typeof warning === "string") : []
  };
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
    cancel: (sessionId, jobId) => call("cancel", { sessionId, jobId }),
    getUsage: async (sessionId, signal) => toUsage(await call("usage", { sessionId }, signal))
  };
}

// src/client/ClaudeCodeView.tsx
var import_react6 = require("react");

// src/client/EventView.tsx
var import_react2 = require("react");

// src/client/styles.ts
var CSS = {
  root: "ccp-root",
  body: "ccp-body",
  usage: "ccp-usage",
  usageHead: "ccp-usageHead",
  usageToggle: "ccp-usageToggle",
  usageMini: "ccp-usageMini",
  usageCaret: "ccp-usageCaret",
  usageDetail: "ccp-usageDetail",
  usagePlan: "ccp-usagePlan",
  usageTier: "ccp-usageTier",
  usageCache: "ccp-usageCache",
  usageStale: "ccp-usageStale",
  usageSpacer: "ccp-usageSpacer",
  usageBadge: "ccp-usageBadge",
  usageBadgeNormal: "ccp-usageBadgeNormal",
  usageBadgeCaution: "ccp-usageBadgeCaution",
  usageBadgeBlocked: "ccp-usageBadgeBlocked",
  usageBadgeUnknown: "ccp-usageBadgeUnknown",
  usageAdvice: "ccp-usageAdvice",
  usageRefresh: "ccp-usageRefresh",
  usageBars: "ccp-usageBars",
  usageRow: "ccp-usageRow",
  usageRowLabel: "ccp-usageRowLabel",
  usageTrack: "ccp-usageTrack",
  usageFill: "ccp-usageFill",
  usageFillWarn: "ccp-usageFillWarn",
  usageFillDanger: "ccp-usageFillDanger",
  usageRowMeta: "ccp-usageRowMeta",
  usageChips: "ccp-usageChips",
  usageChipsLabel: "ccp-usageChipsLabel",
  usageChip: "ccp-usageChip",
  usageNote: "ccp-usageNote",
  usageError: "ccp-usageError",
  tabs: "ccp-tabs",
  tab: "ccp-tab",
  tabActive: "ccp-tabActive",
  tabMain: "ccp-tabMain",
  tabDot: "ccp-tabDot",
  tabDotRunning: "ccp-tabDotRunning",
  tabDotDone: "ccp-tabDotDone",
  tabDotFailed: "ccp-tabDotFailed",
  tabDotKilled: "ccp-tabDotKilled",
  tabLabel: "ccp-tabLabel",
  tabInfo: "ccp-tabInfo",
  modalOverlay: "ccp-modalOverlay",
  modal: "ccp-modal",
  modalHead: "ccp-modalHead",
  modalTitle: "ccp-modalTitle",
  modalClose: "ccp-modalClose",
  modalBody: "ccp-modalBody",
  modalRow: "ccp-modalRow",
  modalKey: "ccp-modalKey",
  modalValue: "ccp-modalValue",
  modalTask: "ccp-modalTask",
  modalFailure: "ccp-modalFailure",
  modalFoot: "ccp-modalFoot",
  pane: "ccp-pane",
  paneHead: "ccp-paneHead",
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
  evTextRaw: "ccp-evTextRaw",
  md: "ccp-md",
  mdRaw: "ccp-mdRaw",
  mdP: "ccp-mdP",
  mdH1: "ccp-mdH1",
  mdH2: "ccp-mdH2",
  mdH3: "ccp-mdH3",
  mdH4: "ccp-mdH4",
  mdH5: "ccp-mdH5",
  mdH6: "ccp-mdH6",
  mdStrong: "ccp-mdStrong",
  mdEm: "ccp-mdEm",
  mdCode: "ccp-mdCode",
  mdPre: "ccp-mdPre",
  mdPreCode: "ccp-mdPreCode",
  mdQuote: "ccp-mdQuote",
  mdList: "ccp-mdList",
  mdItem: "ccp-mdItem",
  mdLink: "ccp-mdLink",
  mdHr: "ccp-mdHr",
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

// src/client/md.ts
var import_react = require("react");
var HEADING = /^(#{1,6})\s+(.*)$/;
var FENCE = /^\s{0,3}(?:```|~~~)\s*([\w+#.-]*)\s*$/;
var FENCE_END = /^\s{0,3}(?:```|~~~)\s*$/;
var RULE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
var QUOTE = /^\s{0,3}>\s?(.*)$/;
var BULLET = /^(\s*)[-*+]\s+(.*)$/;
var ORDERED = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
var HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"];
var HEADING_CLASSES = [CSS.mdH1, CSS.mdH2, CSS.mdH3, CSS.mdH4, CSS.mdH5, CSS.mdH6];
var MAX_DEPTH = 4;
function startsBlock(line) {
  return HEADING.test(line) || FENCE.test(line) || RULE.test(line) || QUOTE.test(line) || BULLET.test(line) || ORDERED.test(line);
}
function safeHref(target) {
  const trimmed = target.trim();
  return /^https?:\/\/[^\s<>"']+$/i.test(trimmed) ? trimmed : null;
}
function parseInline(source, depth) {
  const out = [];
  let plain = "";
  let index = 0;
  let seq = 0;
  const nextKey = () => {
    seq += 1;
    return `i${seq}`;
  };
  const flush = () => {
    if (plain !== "") {
      out.push(plain);
      plain = "";
    }
  };
  while (index < source.length) {
    const char = source.charAt(index);
    if (char === "`") {
      const end = source.indexOf("`", index + 1);
      if (end > index + 1) {
        flush();
        out.push((0, import_react.createElement)("code", { key: nextKey(), className: CSS.mdCode }, source.slice(index + 1, end)));
        index = end + 1;
        continue;
      }
    }
    if (char === "[") {
      const link = /^\[([^\]\n]*)\]\(([^()\s]*)\)/.exec(source.slice(index));
      if (link !== null) {
        const href = safeHref(link[2] ?? "");
        if (href === null) {
          plain += link[0];
        } else {
          flush();
          out.push((0, import_react.createElement)(
            "a",
            { key: nextKey(), className: CSS.mdLink, href, target: "_blank", rel: "noopener noreferrer" },
            ...parseInline(link[1] ?? "", Math.min(depth + 1, MAX_DEPTH))
          ));
        }
        index += link[0].length;
        continue;
      }
    }
    if ((char === "*" || char === "_") && depth < MAX_DEPTH) {
      const double = source.startsWith(char + char, index);
      const marker = double ? char + char : char;
      const end = source.indexOf(marker, index + marker.length);
      const body = end < 0 ? "" : source.slice(index + marker.length, end);
      if (body !== "" && body === body.trim()) {
        flush();
        out.push((0, import_react.createElement)(
          double ? "strong" : "em",
          { key: nextKey(), className: double ? CSS.mdStrong : CSS.mdEm },
          ...parseInline(body, depth + 1)
        ));
        index = end + marker.length;
        continue;
      }
    }
    plain += char;
    index += 1;
  }
  flush();
  return out;
}
function paragraph(lines, key) {
  const children = [];
  lines.forEach((line, at) => {
    if (at > 0) children.push((0, import_react.createElement)("br", { key: `${key}br${at}` }));
    children.push(...parseInline(line, 0));
  });
  return (0, import_react.createElement)("p", { key, className: CSS.mdP }, ...children);
}
function parseBlocks(lines, depth) {
  const out = [];
  let index = 0;
  let seq = 0;
  const nextKey = () => {
    seq += 1;
    return `b${seq}`;
  };
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "") {
      index += 1;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence !== null) {
      const lang = fence[1] ?? "";
      const body = [];
      index += 1;
      while (index < lines.length && !FENCE_END.test(lines[index] ?? "")) {
        body.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;
      const codeClass = lang === "" ? CSS.mdPreCode : `${CSS.mdPreCode} language-${lang}`;
      out.push((0, import_react.createElement)(
        "pre",
        { key: nextKey(), className: CSS.mdPre },
        (0, import_react.createElement)("code", { className: codeClass }, body.join("\n"))
      ));
      continue;
    }
    if (RULE.test(line)) {
      out.push((0, import_react.createElement)("hr", { key: nextKey(), className: CSS.mdHr }));
      index += 1;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading !== null) {
      const level = Math.min((heading[1] ?? "#").length, HEADING_TAGS.length);
      out.push((0, import_react.createElement)(
        HEADING_TAGS[level - 1] ?? "h6",
        { key: nextKey(), className: HEADING_CLASSES[level - 1] ?? CSS.mdH6 },
        ...parseInline(heading[2] ?? "", 0)
      ));
      index += 1;
      continue;
    }
    if (QUOTE.test(line)) {
      const inner = [];
      while (index < lines.length) {
        const quoted = QUOTE.exec(lines[index] ?? "");
        if (quoted === null) break;
        inner.push(quoted[1] ?? "");
        index += 1;
      }
      const children = depth < MAX_DEPTH ? parseBlocks(inner, depth + 1) : [paragraph(inner, "q")];
      out.push((0, import_react.createElement)("blockquote", { key: nextKey(), className: CSS.mdQuote }, ...children));
      continue;
    }
    const bullet = BULLET.exec(line);
    const ordered2 = bullet === null ? ORDERED.exec(line) : null;
    if (bullet !== null || ordered2 !== null) {
      const isOrdered = bullet === null;
      const items = [];
      while (index < lines.length) {
        const current = lines[index] ?? "";
        const match = isOrdered ? ORDERED.exec(current) : BULLET.exec(current);
        if (match !== null) {
          items.push([(isOrdered ? match[3] : match[2]) ?? ""]);
          index += 1;
          continue;
        }
        const last = items[items.length - 1];
        if (last !== void 0 && current.trim() !== "" && !startsBlock(current)) {
          last.push(current.trim());
          index += 1;
          continue;
        }
        break;
      }
      const children = items.map((item, at) => (0, import_react.createElement)(
        "li",
        { key: `li${at}`, className: CSS.mdItem },
        ...parseInline(item.join(" "), 0)
      ));
      const start = isOrdered ? Number(ordered2?.[2] ?? "1") : void 0;
      out.push((0, import_react.createElement)(
        isOrdered ? "ol" : "ul",
        { key: nextKey(), className: CSS.mdList, ...start !== void 0 && start !== 1 ? { start } : {} },
        ...children
      ));
      continue;
    }
    const chunk = [];
    while (index < lines.length) {
      const current = lines[index] ?? "";
      if (current.trim() === "") break;
      if (chunk.length > 0 && startsBlock(current)) break;
      chunk.push(current);
      index += 1;
    }
    out.push(paragraph(chunk, nextKey()));
  }
  return out;
}
var Markdown = (0, import_react.memo)(function Markdown2({ text: text2 }) {
  let blocks;
  try {
    blocks = parseBlocks(text2.replace(/\r\n?/g, "\n").split("\n"), 0);
  } catch {
    return (0, import_react.createElement)("div", { className: CSS.mdRaw }, text2);
  }
  return (0, import_react.createElement)("div", { className: CSS.md }, ...blocks);
});

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
  "detail.title": "\u4EFB\u52A1\u8BE6\u60C5",
  "detail.open": "\u8BE6\u60C5",
  "detail.close": "\u5173\u95ED",
  "detail.task": "\u4EFB\u52A1\u5185\u5BB9",
  "detail.model": "\u6A21\u578B",
  "detail.status": "\u72B6\u6001",
  "detail.startedAt": "\u5F00\u59CB\u4E8E",
  "detail.finishedAt": "\u7ED3\u675F\u4E8E",
  "detail.duration": "\u8017\u65F6",
  "detail.cost": "\u8D39\u7528",
  "detail.turns": "\u8F6E\u6570",
  "detail.failure": "\u5931\u8D25\u539F\u56E0",
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
  "output.raw": "\u539F\u6587",
  "output.preview": "\u9884\u89C8",
  "events.title": "Claude Code \u8F93\u51FA",
  "events.empty": "\u8FD8\u6CA1\u6709\u8F93\u51FA\u2026",
  "events.truncated": "\u2026\u66F4\u65E9\u7684\u4E8B\u4EF6\u5DF2\u88AB\u622A\u65AD\u2026",
  "events.thinking": "\u{1F4AD} \u601D\u8003\u4E2D\u2026\uFF08\u70B9\u51FB\u5C55\u5F00\uFF09",
  "events.thinkingLabel": "\u601D\u8003",
  "events.toolResult": "\u7ED3\u679C",
  "events.toolError": "\u51FA\u9519",
  "events.result": "\u5B8C\u6210",
  "error.prefix": "\u8BFB\u53D6\u5931\u8D25",
  "select.empty": "\u9009\u62E9\u4E0A\u65B9\u7684\u4EFB\u52A1\u67E5\u770B\u8F93\u51FA",
  "usage.title": "\u8BA2\u9605\u989D\u5EA6",
  "usage.plan.unknown": "Claude \u8BA2\u9605",
  "usage.fiveHour": "5 \u5C0F\u65F6",
  "usage.sevenDay": "7 \u5929",
  "usage.fiveHourShort": "5h",
  "usage.sevenDayShort": "7d",
  "usage.expand": "\u5C55\u5F00\u989D\u5EA6\u8BE6\u60C5",
  "usage.collapse": "\u6536\u8D77\u989D\u5EA6\u8BE6\u60C5",
  "usage.reset": "{n} \u91CD\u7F6E",
  "usage.resetSoon": "\u7EA6 {n} \u91CD\u7F6E",
  "usage.scoped": "\u6A21\u578B\u4E13\u9879",
  "usage.advice.normal": "\u6B63\u5E38",
  "usage.advice.caution": "\u6CE8\u610F",
  "usage.advice.blocked": "\u5DF2\u963B\u585E",
  "usage.advice.unknown": "\u672A\u77E5",
  "usage.adviceText.normal": "\u53EF\u4EE5\u7EE7\u7EED\u59D4\u6D3E",
  "usage.adviceText.caution": "\u504F\u9AD8\uFF0C\u5EFA\u8BAE\u51CF\u5C11\u5E76\u53D1\u59D4\u6D3E",
  "usage.adviceText.blocked": "\u63A5\u8FD1/\u8D85\u8FC7\u4E0A\u9650\uFF0C\u6682\u65F6\u4E0D\u8981\u518D\u59D4\u6D3E",
  "usage.adviceText.unknown": "\u7F3A\u5C11\u7A97\u53E3\u6570\u636E",
  "usage.refresh": "\u5237\u65B0",
  "usage.refreshing": "\u5237\u65B0\u4E2D\u2026",
  "usage.cached": "\u7F13\u5B58\u4E8E {n} \u5206\u949F\u524D",
  "usage.cachedStale": "\u26A0\uFE0F \u7F13\u5B58\u4E8E {n} \u5206\u949F\u524D\uFF0C\u53EF\u80FD\u975E\u5B9E\u65F6",
  "usage.cachedUnknown": "\u7F13\u5B58\u65F6\u95F4\u672A\u77E5",
  "usage.loading": "\u989D\u5EA6\u52A0\u8F7D\u4E2D\u2026",
  "usage.loggedOut": "\u8BF7\u5148\u5728\u7EC8\u7AEF\u8FD0\u884C\u4E00\u6B21 `claude` \u5B8C\u6210\u767B\u5F55",
  "usage.failed": "\u989D\u5EA6\u8BFB\u53D6\u5931\u8D25\uFF1A{n}",
  "usage.retry": "\u91CD\u8BD5",
  "usage.noData": "\u6682\u65E0\u989D\u5EA6\u6570\u636E\uFF1A\u8FD0\u884C\u8FC7\u4E00\u6B21 claude \u4F1A\u8BDD\u540E\u624D\u6709"
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
  "detail.title": "Job details",
  "detail.open": "Details",
  "detail.close": "Close",
  "detail.task": "Task",
  "detail.model": "Model",
  "detail.status": "Status",
  "detail.startedAt": "Started",
  "detail.finishedAt": "Finished",
  "detail.duration": "Took",
  "detail.cost": "Cost",
  "detail.turns": "Turns",
  "detail.failure": "Failure",
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
  "output.raw": "Raw",
  "output.preview": "Preview",
  "events.title": "Claude Code output",
  "events.empty": "No output yet\u2026",
  "events.truncated": "\u2026earlier events truncated\u2026",
  "events.thinking": "\u{1F4AD} Thinking\u2026 (click to expand)",
  "events.thinkingLabel": "Thinking",
  "events.toolResult": "Result",
  "events.toolError": "Error",
  "events.result": "Completed",
  "error.prefix": "Read failed",
  "select.empty": "Pick a job above to see its output",
  "usage.title": "Subscription usage",
  "usage.plan.unknown": "Claude subscription",
  "usage.fiveHour": "5-hour",
  "usage.sevenDay": "7-day",
  "usage.fiveHourShort": "5h",
  "usage.sevenDayShort": "7d",
  "usage.expand": "Show usage detail",
  "usage.collapse": "Hide usage detail",
  "usage.reset": "resets {n}",
  "usage.resetSoon": "resets ~{n}",
  "usage.scoped": "per-model",
  "usage.advice.normal": "normal",
  "usage.advice.caution": "caution",
  "usage.advice.blocked": "blocked",
  "usage.advice.unknown": "unknown",
  "usage.adviceText.normal": "safe to delegate",
  "usage.adviceText.caution": "high \u2014 delegate less in parallel",
  "usage.adviceText.blocked": "at/near the limit \u2014 hold off delegating",
  "usage.adviceText.unknown": "no window data",
  "usage.refresh": "Refresh",
  "usage.refreshing": "Refreshing\u2026",
  "usage.cached": "cached {n} min ago",
  "usage.cachedStale": "\u26A0\uFE0F cached {n} min ago, may be stale",
  "usage.cachedUnknown": "cache age unknown",
  "usage.loading": "Loading usage\u2026",
  "usage.loggedOut": "Run `claude` once in a terminal to sign in",
  "usage.failed": "Usage read failed: {n}",
  "usage.retry": "Retry",
  "usage.noData": "No usage data yet \u2014 run one claude session first"
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
function tf(key, value) {
  return t(key).replace("{n}", String(value));
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
  const bodyRef = (0, import_react2.useRef)(null);
  const [following, setFollowing] = (0, import_react2.useState)(true);
  const [expanded, setExpanded] = (0, import_react2.useState)(() => /* @__PURE__ */ new Set());
  const clipped = events.length > MAX_RENDER_EVENTS;
  const visible = (0, import_react2.useMemo)(
    () => clipped ? events.slice(events.length - MAX_RENDER_EVENTS) : events,
    [events, clipped]
  );
  const nodes = (0, import_react2.useMemo)(() => toNodes(visible), [visible]);
  (0, import_react2.useEffect)(() => {
    setFollowing(true);
    setExpanded(/* @__PURE__ */ new Set());
  }, [jobId]);
  (0, import_react2.useLayoutEffect)(() => {
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
          const rawKey = `${node.key}:raw`;
          const raw = expanded.has(rawKey);
          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: CSS.evText, children: [
            raw ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { className: CSS.evTextRaw, children: node.text }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Markdown, { text: node.text }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: CSS.evMore, onClick: () => {
              toggle(rawKey);
            }, children: raw ? t("output.preview") : t("output.raw") })
          ] }, node.key);
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
var import_react3 = require("react");
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
  const bodyRef = (0, import_react3.useRef)(null);
  const [following, setFollowing] = (0, import_react3.useState)(true);
  const { lines, clipped } = (0, import_react3.useMemo)(() => toLines(text2), [text2]);
  (0, import_react3.useEffect)(() => {
    setFollowing(true);
  }, [jobId]);
  (0, import_react3.useLayoutEffect)(() => {
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

// src/client/JobDetailModal.tsx
var import_react4 = require("react");

// src/client/format.ts
function formatDuration2(elapsedMs) {
  const total = Math.max(0, Math.floor(elapsedMs / 1e3));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
function formatClock(at) {
  if (at === void 0 || !Number.isFinite(at)) return "-";
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "-";
  const pad = (value) => String(value).padStart(2, "0");
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  const sameDay = date.toDateString() === (/* @__PURE__ */ new Date()).toDateString();
  return sameDay ? time : `${date.getMonth() + 1}/${date.getDate()} ${time}`;
}
function statusLabel(status) {
  const key = status === "completed" ? "status.completed" : status === "failed" ? "status.failed" : status === "running" ? "status.running" : "status.killed";
  return t(key);
}

// src/client/JobDetailModal.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
function Row({ label, value, danger }) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: CSS.modalRow, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: CSS.modalKey, children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: danger === true ? `${CSS.modalValue} ${CSS.modalFailure}` : CSS.modalValue, children: value === null || value === void 0 || value === "" ? "-" : value })
  ] });
}
function JobDetailModal({ job, detail, now, onClose, onCopySession, copyLabel }) {
  (0, import_react4.useEffect)(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  const live = job.status === "running" || job.status === "stopping";
  const elapsed = detail?.durationMs ?? (live ? now - job.startedAt : (job.finishedAt ?? job.startedAt) - job.startedAt);
  const sessionId = detail?.claudeSessionId;
  const model = detail?.model ?? null;
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
    "div",
    {
      className: CSS.modalOverlay,
      role: "presentation",
      onClick: (event) => {
        if (event.target === event.currentTarget) onClose();
      },
      children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: CSS.modal, role: "dialog", "aria-modal": "true", "aria-label": t("detail.title"), children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: CSS.modalHead, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: CSS.modalTitle, children: t("detail.title") }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: CSS.modalClose, onClick: onClose, children: t("detail.close") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: CSS.modalBody, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Row, { label: t("detail.job"), value: job.id }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Row, { label: t("detail.model"), value: model }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Row, { label: t("detail.status"), value: statusLabel(job.status) }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Row, { label: t("detail.startedAt"), value: formatClock(job.startedAt) }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Row, { label: t("detail.finishedAt"), value: live ? "-" : formatClock(job.finishedAt) }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Row, { label: t("detail.duration"), value: formatDuration2(elapsed) }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            Row,
            {
              label: t("detail.cost"),
              value: detail?.costUsd === void 0 ? null : `$${detail.costUsd.toFixed(2)}`
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Row, { label: t("detail.turns"), value: detail?.numTurns === void 0 ? null : String(detail.numTurns) }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Row, { label: t("detail.session"), value: sessionId }),
          detail?.failureDetail === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Row, { label: t("detail.failure"), value: detail.failureDetail, danger: true }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: CSS.modalRow, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: CSS.modalKey, children: t("detail.task") }) }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("pre", { className: CSS.modalTask, children: detail?.task ?? job.label })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: CSS.modalFoot, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "button",
          {
            type: "button",
            className: CSS.button,
            disabled: sessionId === void 0 || onCopySession === void 0,
            title: t("detail.session.hint"),
            onClick: () => {
              if (sessionId !== void 0) onCopySession?.(sessionId);
            },
            children: copyLabel ?? t("action.copySession")
          }
        ) })
      ] })
    }
  );
}

// src/client/UsageBar.tsx
var import_react5 = require("react");
var import_jsx_runtime4 = require("react/jsx-runtime");
var USAGE_POLL_MS = 3e5;
var DANGER_PERCENT = 80;
var WARN_PERCENT = 50;
function clampPercent(value) {
  if (value === null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}
function fillClass(percent) {
  if (percent >= DANGER_PERCENT) return `${CSS.usageFill} ${CSS.usageFillDanger}`;
  if (percent >= WARN_PERCENT) return `${CSS.usageFill} ${CSS.usageFillWarn}`;
  return CSS.usageFill;
}
var BADGE_CLASS = {
  normal: `${CSS.usageBadge} ${CSS.usageBadgeNormal}`,
  caution: `${CSS.usageBadge} ${CSS.usageBadgeCaution}`,
  blocked: `${CSS.usageBadge} ${CSS.usageBadgeBlocked}`,
  unknown: `${CSS.usageBadge} ${CSS.usageBadgeUnknown}`
};
var BADGE_KEY = {
  normal: "usage.advice.normal",
  caution: "usage.advice.caution",
  blocked: "usage.advice.blocked",
  unknown: "usage.advice.unknown"
};
var ADVICE_KEY = {
  normal: "usage.adviceText.normal",
  caution: "usage.adviceText.caution",
  blocked: "usage.adviceText.blocked",
  unknown: "usage.adviceText.unknown"
};
function formatReset(iso) {
  if (iso === null) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const pad = (value) => String(value).padStart(2, "0");
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const sameDay = at.toDateString() === (/* @__PURE__ */ new Date()).toDateString();
  return sameDay ? time : `${at.getMonth() + 1}/${at.getDate()} ${time}`;
}
function formatPlan(type) {
  if (type === null) return t("usage.plan.unknown");
  return `Claude ${type.charAt(0).toUpperCase()}${type.slice(1)}`;
}
function formatTier(tier) {
  if (tier === null) return null;
  const match = /(\d+)\s*x/i.exec(tier);
  return match ? `${match[1]}x` : tier.replace(/_/g, " ");
}
function cacheLabel(usage) {
  const age = usage.cache.ageMinutes;
  if (age === null) return t("usage.cachedUnknown");
  return tf(usage.cache.maybeStale ? "usage.cachedStale" : "usage.cached", age);
}
function WindowRow({ label, window: window2, soon }) {
  const percent = clampPercent(window2.utilizationPercent);
  const reset = formatReset(window2.resetsAt);
  const shown = window2.utilizationPercent === null ? "\u2014" : `${Math.round(percent)}%`;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: CSS.usageRow, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: CSS.usageRowLabel, children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      "span",
      {
        className: CSS.usageTrack,
        role: "progressbar",
        "aria-label": label,
        "aria-valuenow": Math.round(percent),
        "aria-valuemin": 0,
        "aria-valuemax": 100,
        children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: fillClass(percent), style: { width: `${percent}%` } })
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: CSS.usageRowMeta, children: [
      shown,
      reset === null ? "" : ` \xB7 ${tf(soon ? "usage.resetSoon" : "usage.reset", reset)}`
    ] })
  ] });
}
function shortPercent(window2) {
  if (window2 === null || window2.utilizationPercent === null) return "\u2014";
  return `${Math.round(clampPercent(window2.utilizationPercent))}%`;
}
function UsageBar({ usage, loading, error, onRefresh }) {
  const [expanded, setExpanded] = (0, import_react5.useState)(false);
  const refresh = /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
    "button",
    {
      type: "button",
      className: CSS.usageRefresh,
      disabled: loading,
      onClick: onRefresh,
      title: t("usage.refresh"),
      children: loading ? t("usage.refreshing") : t("usage.refresh")
    }
  );
  const failure = error ?? (usage !== null && !usage.ok ? usage.error ?? t("error.prefix") : null);
  if (failure !== null) {
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: CSS.usage, role: "status", "aria-label": t("usage.title"), children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: CSS.usageHead, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: CSS.usageError, children: tf("usage.failed", failure) }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: CSS.usageSpacer }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: CSS.usageRefresh, disabled: loading, onClick: onRefresh, children: loading ? t("usage.refreshing") : t("usage.retry") })
    ] }) });
  }
  if (usage === null) {
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: CSS.usage, role: "status", "aria-label": t("usage.title"), children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: CSS.usageHead, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: CSS.usageNote, children: t("usage.loading") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: CSS.usageSpacer }),
      refresh
    ] }) });
  }
  const tier = formatTier(usage.subscription.rateLimitTier);
  const scoped = usage.limits.filter((limit) => limit.kind === "weekly_scoped" && limit.scopeModel !== null);
  const hasWindows = usage.fiveHour !== null || usage.sevenDay !== null;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: CSS.usage, role: "status", "aria-label": t("usage.title"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: CSS.usageHead, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
        "button",
        {
          type: "button",
          className: CSS.usageToggle,
          "aria-expanded": expanded,
          title: t(expanded ? "usage.collapse" : "usage.expand"),
          onClick: () => {
            setExpanded((value) => !value);
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: CSS.usageCaret, children: expanded ? "\u25BE" : "\u25B8" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: CSS.usagePlan, children: formatPlan(usage.subscription.type) }),
            tier === null ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: CSS.usageTier, children: [
              "\xB7 ",
              tier
            ] }),
            hasWindows ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: CSS.usageMini, children: [
              t("usage.fiveHourShort"),
              " ",
              shortPercent(usage.fiveHour),
              " \xB7 ",
              t("usage.sevenDayShort"),
              " ",
              shortPercent(usage.sevenDay)
            ] }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: CSS.usageMini, children: t("usage.noData") }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: CSS.usageSpacer }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: BADGE_CLASS[usage.advice], children: t(BADGE_KEY[usage.advice]) })
          ]
        }
      ),
      refresh
    ] }),
    usage.loggedIn ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: CSS.usageNote, children: t("usage.loggedOut") }),
    !expanded ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: CSS.usageDetail, children: [
      hasWindows ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: CSS.usageBars, children: [
        usage.fiveHour === null ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(WindowRow, { label: t("usage.fiveHour"), window: usage.fiveHour, soon: true }),
        usage.sevenDay === null ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(WindowRow, { label: t("usage.sevenDay"), window: usage.sevenDay, soon: false })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: CSS.usageNote, children: t("usage.noData") }),
      scoped.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: CSS.usageChips, children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: CSS.usageChipsLabel, children: t("usage.scoped") }),
        scoped.map((limit) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: CSS.usageChip, children: [
          limit.scopeModel,
          " ",
          Math.round(clampPercent(limit.percent)),
          "%"
        ] }, `${limit.kind}:${limit.scopeModel}`))
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: CSS.usageChips, children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: usage.cache.maybeStale ? `${CSS.usageCache} ${CSS.usageStale}` : CSS.usageCache, children: cacheLabel(usage) }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: CSS.usageAdvice, children: t(ADVICE_KEY[usage.advice]) })
      ] })
    ] })
  ] });
}
function useUsage(api, sessionId) {
  const [usage, setUsage] = (0, import_react5.useState)(null);
  const [loading, setLoading] = (0, import_react5.useState)(true);
  const [error, setError] = (0, import_react5.useState)(null);
  const [nonce, setNonce] = (0, import_react5.useState)(0);
  (0, import_react5.useEffect)(() => {
    const abort = new AbortController();
    const pull = () => {
      setLoading(true);
      api.getUsage(sessionId, abort.signal).then(
        (value) => {
          if (abort.signal.aborted) return;
          setUsage(value);
          setError(null);
          setLoading(false);
        },
        (failure) => {
          if (abort.signal.aborted) return;
          setError(failure instanceof Error ? failure.message : String(failure));
          setLoading(false);
        }
      );
    };
    pull();
    const timer = setInterval(pull, USAGE_POLL_MS);
    return () => {
      abort.abort();
      clearInterval(timer);
    };
  }, [sessionId, nonce]);
  const refresh = (0, import_react5.useCallback)(() => {
    setNonce((value) => value + 1);
  }, []);
  return { usage, loading, error, refresh };
}

// src/client/ClaudeCodeView.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
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
function dotClass(status) {
  switch (status) {
    case "running":
    case "stopping":
      return `${CSS.tabDot} ${CSS.tabDotRunning}`;
    case "completed":
      return `${CSS.tabDot} ${CSS.tabDotDone}`;
    case "killed":
      return `${CSS.tabDot} ${CSS.tabDotKilled}`;
    default:
      return `${CSS.tabDot} ${CSS.tabDotFailed}`;
  }
}
var TAB_LABEL_CHARS = 14;
function clip(label) {
  const flat = label.replace(/\s+/g, " ").trim();
  return flat.length > TAB_LABEL_CHARS ? `${flat.slice(0, TAB_LABEL_CHARS)}\u2026` : flat;
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
    const rows = (0, import_react6.useMemo)(() => ordered(mirrored.filter((job) => job.kind === JOB_KIND)), [mirrored]);
    const panel = panelOf(sessionId);
    const [selected, setSelected] = (0, import_react6.useState)(() => panel.selected ?? defaultSelection(rows));
    const [meta, setMeta] = (0, import_react6.useState)({});
    const [error, setError] = (0, import_react6.useState)(null);
    const [now, setNow] = (0, import_react6.useState)(() => Date.now());
    const [copied, setCopied] = (0, import_react6.useState)(null);
    const [detailFor, setDetailFor] = (0, import_react6.useState)(void 0);
    const [revision, setRevision] = (0, import_react6.useState)(0);
    const bumpRef = (0, import_react6.useRef)(() => {
      setRevision((value) => value + 1);
    });
    const usage = useUsage(api, sessionId);
    (0, import_react6.useEffect)(() => {
      const stillThere = selected !== void 0 && rows.some((job) => job.id === selected);
      const next = stillThere ? selected : defaultSelection(rows);
      if (next !== selected) setSelected(next);
      panel.selected = next;
    }, [rows, selected, panel]);
    const current = rows.find((job) => job.id === selected);
    const currentStatus = current?.status;
    const lifecycle = rows.map((job) => `${job.id}:${job.status}`).join(",");
    (0, import_react6.useEffect)(() => {
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
    (0, import_react6.useEffect)(() => {
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
    (0, import_react6.useEffect)(() => {
      if (liveCount === 0) return;
      setNow(Date.now());
      const timer = setInterval(() => {
        setNow(Date.now());
      }, 1e3);
      return () => {
        clearInterval(timer);
      };
    }, [liveCount]);
    const onCancel = (0, import_react6.useCallback)((jobId) => {
      if (!window.confirm(t("action.cancel.confirm"))) return;
      api.cancel(sessionId, jobId).catch((failure) => {
        setError(`${t("error.prefix")}: ${failure instanceof Error ? failure.message : String(failure)}`);
      });
    }, [sessionId]);
    const flashCopied = (0, import_react6.useCallback)((token) => {
      setCopied(token);
      window.setTimeout(() => {
        setCopied((value) => value === token ? null : value);
      }, 1500);
    }, []);
    const detail = current ? meta[current.id] : void 0;
    const output = current ? panel.outputs.get(current.id) : void 0;
    const events = current ? panel.events.get(current.id) : void 0;
    void revision;
    const modalJob = detailFor === void 0 ? void 0 : rows.find((job) => job.id === detailFor);
    const closeDetail = (0, import_react6.useCallback)(() => {
      setDetailFor(void 0);
    }, []);
    const copySession = (0, import_react6.useCallback)((sessionId2) => {
      void copy(sessionId2).then((done) => {
        if (done) flashCopied("session");
      });
    }, [flashCopied]);
    const usageBar = /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(UsageBar, { usage: usage.usage, loading: usage.loading, error: usage.error, onRefresh: usage.refresh });
    if (rows.length === 0) {
      return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: CSS.root, "data-conversation-composer-overlay": "", children: [
        usageBar,
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: CSS.empty, children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: CSS.emptyTitle, children: t("list.empty.title") }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { children: t("list.empty.hint") }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { children: t("list.empty.note") })
        ] })
      ] });
    }
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: CSS.root, "data-conversation-composer-overlay": "", children: [
      usageBar,
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: CSS.body, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: CSS.tabs, role: "tablist", "aria-label": t("list.title"), children: rows.map((job) => {
          const active = job.id === selected;
          return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { role: "presentation", className: active ? `${CSS.tab} ${CSS.tabActive}` : CSS.tab, children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
              "button",
              {
                type: "button",
                role: "tab",
                "aria-selected": active,
                className: CSS.tabMain,
                title: job.label,
                onClick: () => {
                  setSelected(job.id);
                  panel.selected = job.id;
                },
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: dotClass(job.status) }),
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: CSS.tabLabel, children: clip(job.label) })
                ]
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              "button",
              {
                type: "button",
                className: CSS.tabInfo,
                title: t("detail.open"),
                "aria-label": t("detail.open"),
                onClick: (event) => {
                  event.stopPropagation();
                  setDetailFor(job.id);
                },
                children: "\u24D8"
              }
            )
          ] }, job.id);
        }) }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: CSS.pane, children: current === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: CSS.empty, children: t("select.empty") }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: CSS.paneHead, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: CSS.stats, children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: CSS.stat, children: [
              t("detail.job"),
              ": ",
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: CSS.mono, children: current.id })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: CSS.stat, children: statusLabel(current.status) }),
            detail?.numTurns !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: CSS.stat, children: [
              detail.numTurns,
              " ",
              t("stats.turns")
            ] }) : null,
            detail?.costUsd !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: CSS.stat, children: [
              t("stats.cost"),
              " $",
              detail.costUsd.toFixed(4)
            ] }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: CSS.stat, children: [
              t("stats.duration"),
              " ",
              formatDuration2(isLive(current) ? now - current.startedAt : (current.finishedAt ?? current.startedAt) - current.startedAt)
            ] }),
            current.detail !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: CSS.stat, children: current.detail }) : null
          ] }) }),
          error !== null ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: CSS.error, children: error }) : null,
          events !== void 0 && events.list.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            EventView,
            {
              jobId: current.id,
              events: events.list,
              truncated: events.truncated
            }
          ) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            OutputView,
            {
              jobId: current.id,
              text: output?.text ?? (detail?.finalOutput ?? ""),
              truncated: output?.truncated ?? false
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: CSS.actions, children: [
            isLive(current) ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: `${CSS.button} ${CSS.danger}`, onClick: () => {
              onCancel(current.id);
            }, children: t("action.cancel") }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
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
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
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
      ] }),
      modalJob === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        JobDetailModal,
        {
          job: modalJob,
          detail: meta[modalJob.id],
          now,
          onClose: closeDetail,
          onCopySession: copySession,
          copyLabel: copied === "session" ? t("action.copied") : t("action.copySession")
        }
      )
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

