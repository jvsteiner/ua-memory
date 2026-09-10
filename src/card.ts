import type { LoadedMap, UaLayer } from "./graph.js";

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
export const TOKEN_BUDGET = 6000;

/**
 * Per-layer file caps tried in order when the card overruns. Layer names and
 * descriptions are never cut: they are the part that tells an agent where
 * things live, and they cost ~720 tokens for ten layers. File lists are the
 * part that scales with the repo, so they are what gives.
 */
const FILE_CAPS = [Number.POSITIVE_INFINITY, 40, 25, 15, 10, 6, 3, 1, 0];

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
  for (const cap of FILE_CAPS) {
    const card = build(primary, others, input, cap);
    if (estimateTokens(card) <= TOKEN_BUDGET) return card;
  }
  // Even with no file lists it does not fit. Layers and descriptions are the
  // floor — returning them over budget beats returning nothing.
  return build(primary, others, input, 0);
}

function build(
  primary: LoadedMap,
  others: LoadedMap[],
  input: CardInput,
  fileCap: number,
): string {
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
  if (Number.isFinite(fileCap)) {
    out.push(
      "File lists below are shortened to fit the context budget. " +
        "Run `ua-memory layer <name>` for a layer's full list.",
    );
  }
  out.push("");
  out.push(`## Layers (${primary.graph.layers.length})`);

  for (const layer of primary.graph.layers) {
    const files = filesIn(primary, layer);
    const shown = Number.isFinite(fileCap) ? files.slice(0, fileCap) : files;
    const hidden = files.length - shown.length;
    out.push("");
    out.push(`### ${layer.name} — ${files.length} files`);
    out.push(layer.description);
    if (shown.length > 0) {
      const tail = hidden > 0 ? `, and ${hidden} more` : "";
      out.push(wrap(`${shown.join(", ")}${tail}`, WRAP_COLS));
    } else if (hidden > 0) {
      out.push(`${hidden} files — run \`ua-memory layer ${layer.name}\``);
    }
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
