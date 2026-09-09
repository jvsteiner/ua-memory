import type { LoadedMap } from "./graph.js";
/**
 * Hard ceiling for the card, in tokens. Measured baseline is ~1,700; the rest
 * is headroom for the map growing a layer or fifty files. It is a test, not a
 * guideline — see test/card.test.ts. Anything that needs more room belongs in
 * the CLI, on demand, not in every session.
 */
export declare const TOKEN_BUDGET = 2500;
/** Roughly four characters per token. Good enough to hold a budget line. */
export declare function estimateTokens(text: string): number;
export interface CardInput {
    /** Current git HEAD, or null when we could not read it. */
    head: string | null;
    /** Files changed between the map's commit and HEAD, or null if unknown. */
    changedFiles: string[] | null;
}
export declare function renderCard(primary: LoadedMap, others: LoadedMap[], input: CardInput): string;
