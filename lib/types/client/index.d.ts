import type { Context } from './types.js';
/** Services required before the panel can register (client runtime provides both). */
export declare const inject: string[];
/**
 * Client plugin body.
 * @param ctx - the client cordis context (slots + connection).
 */
export declare function apply(ctx: Context): void;
