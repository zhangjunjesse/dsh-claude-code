/**
 * Self-contained zh/en copy for the monitor panel.
 *
 * The panel deliberately does not inject the `locale` service: it only needs
 * two dictionaries and no live language switching, and staying off that service
 * keeps the bundle's `inject` list to `slots` + `connection`. The active
 * language follows the document, then the browser, and falls back to Chinese.
 */
/** Simplified Chinese dictionary (the key-set source of truth). */
export declare const zh: {
    'view.label': string;
    'list.title': string;
    'list.empty.title': string;
    'list.empty.hint': string;
    'list.empty.note': string;
    'status.running': string;
    'status.completed': string;
    'status.failed': string;
    'status.killed': string;
    'detail.job': string;
    'detail.session': string;
    'detail.session.hint': string;
    'detail.title': string;
    'detail.open': string;
    'detail.close': string;
    'detail.task': string;
    'detail.model': string;
    'detail.status': string;
    'detail.startedAt': string;
    'detail.finishedAt': string;
    'detail.duration': string;
    'detail.cost': string;
    'detail.turns': string;
    'detail.failure': string;
    'stats.turns': string;
    'stats.cost': string;
    'stats.duration': string;
    'action.cancel': string;
    'action.cancel.confirm': string;
    'action.copyOutput': string;
    'action.copySession': string;
    'action.copied': string;
    'output.title': string;
    'output.empty': string;
    'output.truncated': string;
    'output.follow': string;
    'output.collapse': string;
    'output.expand': string;
    'output.raw': string;
    'output.preview': string;
    'events.title': string;
    'events.empty': string;
    'events.truncated': string;
    'events.thinking': string;
    'events.thinkingLabel': string;
    'events.toolResult': string;
    'events.toolError': string;
    'events.result': string;
    'error.prefix': string;
    'select.empty': string;
    'usage.title': string;
    'usage.plan.unknown': string;
    'usage.fiveHour': string;
    'usage.sevenDay': string;
    'usage.fiveHourShort': string;
    'usage.sevenDayShort': string;
    'usage.expand': string;
    'usage.collapse': string;
    'usage.reset': string;
    'usage.resetSoon': string;
    'usage.scoped': string;
    'usage.advice.normal': string;
    'usage.advice.caution': string;
    'usage.advice.blocked': string;
    'usage.advice.unknown': string;
    'usage.adviceText.normal': string;
    'usage.adviceText.caution': string;
    'usage.adviceText.blocked': string;
    'usage.adviceText.unknown': string;
    'usage.refresh': string;
    'usage.refreshing': string;
    'usage.cached': string;
    'usage.cachedStale': string;
    'usage.cachedUnknown': string;
    'usage.loading': string;
    'usage.loggedOut': string;
    'usage.failed': string;
    'usage.retry': string;
    'usage.noData': string;
};
/** English dictionary, key-identical to the Chinese source of truth. */
export declare const en: Record<keyof typeof zh, string>;
/** Translation key set. */
export type LocaleKey = keyof typeof zh;
/** Resolve one copy key in the active language. */
export declare function t(key: LocaleKey): string;
/** Resolve one copy key and substitute its single `{n}` placeholder. */
export declare function tf(key: LocaleKey, value: string | number): string;
