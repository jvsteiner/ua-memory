/**
 * The whole SessionStart job: find the maps, pick one, render the card.
 * Returns null when this repo has no finished map — silence is correct there.
 * Throws only on a UA schema break, which the caller should surface loudly.
 */
export declare function buildCardFor(cwd: string): string | null;
