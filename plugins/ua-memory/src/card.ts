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

/**
 * Per-layer file caps tried in order when the card overruns. Layer names and
 * descriptions are never cut. On this repo's own map they are 2,871 characters
 * against 11,945 for the file paths — the cheap half, and the half that
 * actually says where things live. File lists scale with the repo, so file
 * lists are what gives.
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
    if (card.length <= CHAR_BUDGET) return card;
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
      "File lists below are shortened to fit the 10,000 character limit on " +
        "session-start context. `ua-memory layer <name>` reports a full list.",
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

  // Factual statements, not instructions. Claude Code's hooks reference warns
  // that injected text framed as out-of-band system commands trips the
  // prompt-injection defences, and the text is then surfaced to the user
  // instead of being used as context.
  out.push("");
  out.push("## About this map");
  out.push(
    "- The import and call edges in this map were extracted by tree-sitter from the source.",
  );
  out.push(
    "- The summaries, tags and layer names in this map were written by an LLM and can be out of date.",
  );
  out.push(
    "- This map records no dynamic `import()` edges and no re-exports through a barrel file, so some real dependents are missing from it.",
  );
  out.push(
    "- The `ua-memory` command reports more: `ua-memory file <path>`, `ua-memory impact <path>`, `ua-memory layer <name>`. The graph JSON behind this card is about 100,000 tokens.",
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
