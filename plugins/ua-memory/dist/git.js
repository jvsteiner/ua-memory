import { spawnSync } from "node:child_process";
function git(dir, args) {
    const run = spawnSync("git", args, { cwd: dir, encoding: "utf8", timeout: 3000 });
    if (run.status !== 0 || typeof run.stdout !== "string")
        return null;
    return run.stdout.trim();
}
export function gitHead(dir) {
    return git(dir, ["rev-parse", "HEAD"]);
}
/**
 * Files under `projectDir` that changed between `commit` and HEAD.
 *
 * Returns null when git cannot answer — a shallow clone, or a commit that was
 * rebased away. Null means "unknown", which the card reports honestly rather
 * than claiming the map is fresh.
 */
export function changedFilesSince(repoRoot, projectPrefix, commit) {
    const out = git(repoRoot, ["diff", "--name-only", `${commit}`, "HEAD"]);
    if (out === null)
        return null;
    if (out === "")
        return [];
    const prefix = projectPrefix === "" ? "" : `${projectPrefix}/`;
    return out
        .split("\n")
        .filter((p) => p.startsWith(prefix))
        .map((p) => p.slice(prefix.length))
        .filter((p) => p.length > 0 && !/\.(test|spec)\./.test(p));
}
