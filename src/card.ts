import type { LoadedMap, UaLayer } from "./graph.js";

/**
 * Hard ceiling for the card, in tokens. Measured baseline is ~1,700; the rest
 * is headroom for the map growing a layer or fifty files. It is a test, not a
 * guideline — see test/card.test.ts. Anything that needs more room belongs in
 * the CLI, on demand, not in every session.
 */
export const TOKEN_BUDGET = 2500;

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

const WRAP_COLS = 76;
const MAX_CHANGED_LISTED = 10;

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
    const files = filesIn(primary, layer);
    out.push("");
    out.push(`### ${layer.name} — ${files.length} files`);
    out.push(layer.description);
    out.push(wrap(files.join(", "), WRAP_COLS));
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
  out.push("## How to read this");
  out.push(
    "- Import and call edges come from tree-sitter parsing. Treat them as fact.",
  );
  out.push(
    "- Summaries, tags and layer names were written by an LLM. Treat them as hints and verify before relying on one.",
  );
  out.push(
    "- For more detail, run `ua-memory file <path>`, `ua-memory impact <path>` or `ua-memory layer <name>`. Never read the graph JSON directly — it is about 100,000 tokens.",
  );

  return out.join("\n");
}

function filesIn(map: LoadedMap, layer: UaLayer): string[] {
  return layer.nodeIds
    .map((id) => map.byId.get(id))
    .filter((n): n is NonNullable<typeof n> => !!n && n.type === "file")
    .map((n) => n.filePath)
    .sort();
}

function freshnessLine(map: LoadedMap, input: CardInput): string {
  const built = map.meta?.gitCommitHash;
  if (!built) return "Map built at an unknown commit — freshness cannot be checked.";
  const short = built.slice(0, 7);
  if (!input.head) return `Map built at ${short}. Current commit unknown, so it may be stale.`;
  if (input.head === built) return `Map built at ${short}, which is the current commit. It is up to date.`;

  const changed = input.changedFiles ?? [];
  const head = input.head.slice(0, 7);
  if (changed.length === 0) {
    return `Map built at ${short}; HEAD is now ${head}. No source files changed between them.`;
  }
  const listed = changed.slice(0, MAX_CHANGED_LISTED);
  const more = changed.length - listed.length;
  const tail = more > 0 ? `, and ${more} more` : "";
  return (
    `Map built at ${short}; HEAD is now ${head}. ` +
    `${changed.length} file${changed.length === 1 ? "" : "s"} changed since: ` +
    `${listed.join(", ")}${tail}. Check those against the map before trusting it.`
  );
}

function wrap(text: string, cols: number): string {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line.length > 0 && line.length + word.length + 1 > cols) {
      lines.push(line);
      line = word;
    } else {
      line = line.length > 0 ? `${line} ${word}` : word;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines.join("\n");
}
