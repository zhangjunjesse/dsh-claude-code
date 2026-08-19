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
    'error.prefix': string;
    'select.empty': string;
};
/** English dictionary, key-identical to the Chinese source of truth. */
export declare const en: Record<keyof typeof zh, string>;
/** Translation key set. */
export type LocaleKey = keyof typeof zh;
/** Resolve one copy key in the active language. */
export declare function t(key: LocaleKey): string;
