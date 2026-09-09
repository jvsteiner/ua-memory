export declare function gitHead(dir: string): string | null;
/**
 * Files under `projectDir` that changed between `commit` and HEAD.
 *
 * Returns null when git cannot answer — a shallow clone, or a commit that was
 * rebased away. Null means "unknown", which the card reports honestly rather
 * than claiming the map is fresh.
 */
export declare function changedFilesSince(repoRoot: string, projectPrefix: string, commit: string): string[] | null;
