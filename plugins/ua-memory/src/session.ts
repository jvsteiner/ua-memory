import { relative } from "node:path";
import { renderCard } from "./card.js";
import { changedFilesSince, gitHead } from "./git.js";
import { findGitRoot, findMapDirs, loadMap, pickPrimary, type LoadedMap } from "./graph.js";

/**
 * The whole SessionStart job: find the maps, pick one, render the card.
 * Returns null when this repo has no finished map — silence is correct there.
 * Throws only on a UA schema break, which the caller should surface loudly.
 */
export function buildCardFor(cwd: string): string | null {
  const dirs = findMapDirs(cwd);
  if (dirs.length === 0) return null;

  const maps: LoadedMap[] = dirs.map((dir) => loadMap(dir));
  const primary = pickPrimary(maps, cwd);
  if (!primary) return null;
  const others = maps.filter((m) => m !== primary);

  const repoRoot = findGitRoot(primary.projectDir);
  const head = repoRoot ? gitHead(repoRoot) : null;
  const built = primary.meta?.gitCommitHash ?? null;
  const changedFiles =
    repoRoot && head && built && head !== built
      ? changedFilesSince(repoRoot, relative(repoRoot, primary.projectDir), built)
      : null;

  return renderCard(primary, others, { head, changedFiles });
}
