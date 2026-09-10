import type { LoadedMap } from "./graph.js";
/**
 * Hard ceiling for the card, in tokens.
 *
 * The point of this tool is large codebases, so the ceiling has to be large
 * enough to describe one: a 157-file map renders at ~2,000 tokens and a
 * 274-file map at ~4,000, and both are small next to what this is for.
 * 6,000 leaves real room while staying a fraction of a context window.
 *
 * It is enforced in `renderCard`, not only in a test. The first version capped
 * it at 2,500 and checked that in a test against one small fixture, so a bigger
 * real map silently rendered 60% over — the exact silent growth the cap existed
 * to stop. A ceiling only guarded by a test is not a ceiling.
 */
export declare const TOKEN_BUDGET = 6000;
/** Roughly four characters per token. Good enough to hold a budget line. */
export declare function estimateTokens(text: string): number;
export interface CardInput {
    /** Current git HEAD, or null when we could not read it. */
    head: string | null;
    /** Files changed between the map's commit and HEAD, or null if unknown. */
    changedFiles: string[] | null;
}
export declare function renderCard(primary: LoadedMap, others: LoadedMap[], input: CardInput): string;
