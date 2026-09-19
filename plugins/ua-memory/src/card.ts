import type { LoadedMap, UaLayer } from "./graph.js";

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
export const HARNESS_CHAR_CAP = 10000;

/** Our ceiling, with room under the cap for the JSON envelope and any drift. */
export const CHAR_BUDGET = 9500;

/** Roughly four characters per token. Good enough to hold a budget line. */
export function estimateTokens(text: string): number {
  return Math.round(text.length / 4);
}

export interface CardInput {
  /** Current git HEAD, or null when we could not read it. */
  head: string | null;
  /** Files changed between the map's commit and HEAD, or null if unknown. */
  changedFiles: string[] | null;
}

/** Layer vocabulary is always included; file lookup stays on demand. */
export function renderCard(primary: LoadedMap, others: LoadedMap[], input: CardInput): string {
  const { project } = primary.graph;
  const out: string[] = [];

  out.push(`# Codebase map — ${project.name}`);
  out.push("");
  out.push(project.description);
  if (project.languages?.length) out.push(`Languages: ${project.languages.join(", ")}`);
  if (project.frameworks?.length) out.push(`Frameworks: ${project.frameworks.join(", ")}`);
  out.push("");
  out.push(freshnessLine(primary, input));
  if (primary.excludesTests) {
    out.push("Test files are excluded from this map.");
  }
  if (primary.issues.length > 0) {
    out.push(`${primary.issues.length} data problems in the map — run \`ua-memory doctor\`.`);
  }
  out.push("");
  out.push(`## Layers (${primary.graph.layers.length})`);

  for (const layer of primary.graph.layers) {
    out.push("");
    out.push(`### ${layer.name} — ${layerCounts(primary, layer)}`);
    out.push(layer.description);
  }

  if (others.length > 0) {
    out.push("");
    out.push("## Also mapped in this repo");
    for (const other of others) {
      const rel = other.projectDir.replace(primary.projectDir, "").replace(/^\//, "") || ".";
      out.push(
        `- ${rel} — ${other.graph.layers.length} layers, ${other.fileCount} files. ` +
          "Ask for it with `ua-memory card --root <path>`.",
      );
    }
  }

  out.push("");
  out.push(
    "Layer names and summaries were written by an LLM and can be out of date. " +
    "Import/call edges were extracted by tree-sitter; dynamic import() and barrel re-exports are missing. " +
    "Details: `ua-memory layer <name>`, `ua-memory stale`.",
  );
  return out.join("\n");
}

function layerCounts(map: LoadedMap, layer: UaLayer): string {
  const counts = new Map<string, number>();
  for (const id of new Set(layer.nodeIds)) {
    const node = map.byId.get(id);
    if (node) counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b))
    .map(([type, count]) => `${count} ${type}${count === 1 ? "" : type === "class" ? "es" : "s"}`)
    .join(", ") || "0 nodes";
}

function freshnessLine(map: LoadedMap, input: CardInput): string {
  const built = map.meta?.gitCommitHash;
  if (!built) return "Map built at an unknown commit — freshness cannot be checked.";
  const short = built.slice(0, 7);
  if (!input.head) return `Map built at ${short}. Current commit unknown, so it may be stale.`;
  if (input.head === built) return `Map built at ${short}, which is the current commit. It is up to date.`;

  if (input.changedFiles === null) {
    return `Map built at ${short}; HEAD is now ${input.head.slice(0, 7)}. Changed files unknown; freshness cannot be checked.`;
  }
  const changed = input.changedFiles;
  const head = input.head.slice(0, 7);
  if (changed.length === 0) {
    return `Map built at ${short}; HEAD is now ${head}. No source files changed between them.`;
  }
  return (
    `Map built at ${short}; HEAD is now ${head}. ` +
    `${changed.length} file${changed.length === 1 ? "" : "s"} changed since; map may be stale.`
  );
}
