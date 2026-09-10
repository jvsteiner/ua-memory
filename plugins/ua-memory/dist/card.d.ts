import type { LoadedMap } from "./graph.js";
/**
 * Claude Code caps every hook output string — `additionalContext`, plain
 * stdout, `systemMessage` — at 10,000 characters. Past that it does not
 * truncate: it writes the whole string to a file and injects a short preview
 * plus the file path instead, exactly as it handles oversized Bash output.
 *
 * This is documented in the hooks reference, and it is not a soft limit. A
 * 16,028-character card for this repo spilled to a file in five separate
 * sessions; the model saw two of ten layer names and a path it would have had
 * to open. The card looked broken while the hook was working perfectly.
 *
 * So the real unit is characters, not tokens, and the number is not ours to
 * choose. An earlier version set a 6,000-token budget — about 24,000
 * characters — reasoning about context cost, which is the wrong constraint
 * entirely.
 */
export declare const HARNESS_CHAR_CAP = 10000;
/** Our ceiling, with room under the cap for the JSON envelope and any drift. */
export declare const CHAR_BUDGET = 9500;
/** Roughly four characters per token. Good enough to hold a budget line. */
export declare function estimateTokens(text: string): number;
export interface CardInput {
    /** Current git HEAD, or null when we could not read it. */
    head: string | null;
    /** Files changed between the map's commit and HEAD, or null if unknown. */
    changedFiles: string[] | null;
}
export declare function renderCard(primary: LoadedMap, others: LoadedMap[], input: CardInput): string;
