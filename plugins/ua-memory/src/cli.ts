import { relative } from "node:path";
import { renderCard } from "./card.js";
import { changedFilesSince, gitHead } from "./git.js";
import { findGitRoot, findMapDirs, loadMap, pickPrimary, type LoadedMap } from "./graph.js";
import { defaultOmpExtensionsDir, ompInstall, ompStatus, ompUninstall } from "./omp-install.js";
import {
  NO_DEPENDENTS_CAVEAT,
  describeFile,
  filesInLayer,
  findLayer,
  impact,
  resolveFile,
  where,
} from "./queries.js";

const USAGE = `ua-memory — query this repo's Understand-Anything map

  card                     the architecture card injected at session start
  where <text>             find nodes by name, tag or summary
  file <path>              what one file is, what it holds, what it touches
  impact <path>            what would feel a change to this file
  layer <name>             one layer's description and its files
  stale                    files changed since the map was built
  tour                     the guided tour, longest to shortest (~3,800 tokens)
  doctor                   map location, freshness and data problems
  omp <install|status|uninstall>
                           the card for omp / Pi, which does not run
                           Claude Code SessionStart hooks

Options
  --json                   machine-readable output
  --depth <n>              impact only, default 1, max 3
  --limit <n>              where only, default 20
  --root <path>            use the map for this directory
  --dir <path>             omp only, override the extensions directory
`;

interface Args {
  command: string;
  rest: string[];
  json: boolean;
  depth: number;
  limit: number;
  root: string | null;
  dir: string | null;
}

function parse(argv: string[]): Args {
  const rest: string[] = [];
  let json = false;
  let depth = 1;
  let limit = 20;
  let root: string | null = null;
  let dir: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") json = true;
    else if (arg === "--depth") depth = Math.min(3, Math.max(1, Number(argv[++i]) || 1));
    else if (arg === "--limit") limit = Math.max(1, Number(argv[++i]) || 20);
    else if (arg === "--root") root = argv[++i] ?? null;
    else if (arg === "--dir") dir = argv[++i] ?? null;
    else rest.push(arg);
  }
  return { command: rest.shift() ?? "help", rest, json, depth, limit, root, dir };
}

function loadPrimary(cwd: string, root: string | null): { primary: LoadedMap; others: LoadedMap[] } {
  const dirs = findMapDirs(root ?? cwd);
  if (dirs.length === 0) {
    throw new Error(
      "No finished Understand-Anything map found. Run /understand in this repo first.",
    );
  }
  const maps = dirs.map((dir) => loadMap(dir));
  const primary = pickPrimary(maps, root ?? cwd)!;
  return { primary, others: maps.filter((m) => m !== primary) };
}

function staleness(primary: LoadedMap) {
  const repoRoot = findGitRoot(primary.projectDir);
  const head = repoRoot ? gitHead(repoRoot) : null;
  const built = primary.meta?.gitCommitHash ?? null;
  const changedFiles =
    repoRoot && head && built && head !== built
      ? changedFilesSince(repoRoot, relative(repoRoot, primary.projectDir), built)
      : null;
  return { head, built, changedFiles };
}

export function run(argv: string[], cwd: string): { out: string; code: number } {
  const args = parse(argv);
  if (args.command === "help" || args.command === "--help") return { out: USAGE, code: 0 };

  if (args.command === "omp") return runOmp(args);

  let primary: LoadedMap;
  let others: LoadedMap[];
  try {
    ({ primary, others } = loadPrimary(cwd, args.root));
  } catch (error) {
    return { out: error instanceof Error ? error.message : String(error), code: 1 };
  }

  const emit = (value: unknown, text: string) =>
    args.json ? { out: JSON.stringify(value, null, 2), code: 0 } : { out: text, code: 0 };

  switch (args.command) {
    case "card": {
      const { head, changedFiles } = staleness(primary);
      return { out: renderCard(primary, others, { head, changedFiles }), code: 0 };
    }

    case "where": {
      const text = args.rest.join(" ");
      if (!text) return { out: "ua-memory where <text>", code: 1 };
      const hits = where(primary, text, args.limit);
      if (hits.length === 0) return { out: `Nothing matches "${text}".`, code: 0 };
      return emit(
        hits,
        hits
          .map((h) => `${h.path}  ${h.name} (${h.type}, matched ${h.why}) — ${h.layer ?? "no layer"}`)
          .join("\n"),
      );
    }

    case "file": {
      const info = describeFile(primary, args.rest[0] ?? "");
      if (!info) return { out: notFound(primary, args.rest[0] ?? ""), code: 1 };
      const lines = [
        info.path,
        `Layer: ${info.layer ?? "none"}`,
        info.complexity ? `Complexity: ${info.complexity}` : null,
        info.tags.length ? `Tags: ${info.tags.join(", ")}` : null,
        "",
        info.summary ?? "(no summary)",
        info.languageNotes ? `\nNote: ${info.languageNotes}` : null,
        info.functions.length
          ? `\nHolds ${info.functions.length}:\n` +
            info.functions
              .map((f) => `  ${f.name}${f.lineRange ? ` (${f.lineRange[0]}-${f.lineRange[1]})` : ""}`)
              .join("\n")
          : null,
        info.dependsOn.length ? `\nImports ${info.dependsOn.length}: ${info.dependsOn.join(", ")}` : null,
        info.dependedOnBy.length
          ? `\nUsed by ${info.dependedOnBy.length}: ${info.dependedOnBy.join(", ")}`
          : `\n${NO_DEPENDENTS_CAVEAT}`,
      ].filter((l): l is string => l !== null);
      return emit(info, lines.join("\n"));
    }

    case "impact": {
      const target = args.rest[0] ?? "";
      const resolved = resolveFile(primary, target);
      if (!resolved) return { out: notFound(primary, target), code: 1 };
      const hits = impact(primary, resolved, args.depth);
      if (hits.length === 0) {
        return emit({ path: resolved, hits, caveat: NO_DEPENDENTS_CAVEAT }, NO_DEPENDENTS_CAVEAT);
      }
      const byLayer = new Map<string, string[]>();
      for (const hit of hits) {
        const key = hit.layer ?? "no layer";
        byLayer.set(key, [...(byLayer.get(key) ?? []), `${hit.path} (${hit.via}, depth ${hit.depth})`]);
      }
      const text = [
        `${hits.length} files would feel a change to ${resolved}:`,
        ...[...byLayer].map(([layer, files]) => `\n${layer}\n  ${files.join("\n  ")}`),
        `\nEdges are tree-sitter facts, but incomplete: ${NO_DEPENDENTS_CAVEAT}`,
      ].join("\n");
      return emit({ path: resolved, hits }, text);
    }

    case "layer": {
      const name = args.rest.join(" ");
      const layer = findLayer(primary, name);
      if (!layer) {
        const all = primary.graph.layers.map((l) => l.name).join(", ");
        return { out: `No layer matches "${name}". Layers: ${all}`, code: 1 };
      }
      const files = filesInLayer(primary, layer);
      return emit(
        { ...layer, files },
        `${layer.name} — ${files.length} files\n\n${layer.description}\n\n${files.join("\n")}`,
      );
    }

    case "stale": {
      const { head, built, changedFiles } = staleness(primary);
      if (!built) return { out: "The map records no commit, so freshness cannot be checked.", code: 0 };
      if (head === built) return { out: `Map is current (${built.slice(0, 7)}).`, code: 0 };
      if (changedFiles === null) {
        return { out: `Map built at ${built.slice(0, 7)}; git cannot compare it to HEAD.`, code: 0 };
      }
      return emit(
        { built, head, changedFiles },
        changedFiles.length === 0
          ? `Map built at ${built.slice(0, 7)}; no files under this project changed since.`
          : `${changedFiles.length} files changed since the map was built:\n${changedFiles.join("\n")}`,
      );
    }

    case "tour": {
      const tour = (primary.graph.tour ?? []) as { order: number; title: string; description: string }[];
      if (tour.length === 0) return { out: "This map has no tour.", code: 0 };
      return emit(
        tour,
        tour.map((s) => `${s.order}. ${s.title}\n${s.description}`).join("\n\n"),
      );
    }

    case "doctor": {
      const { head, built } = staleness(primary);
      const lines = [
        `Map:      ${primary.uaDir}`,
        `Describes:${primary.projectDir}`,
        `Built at: ${built ?? "unknown"}`,
        `HEAD:     ${head ?? "unknown"}`,
        `Contents: ${primary.fileCount} files, ${primary.graph.edges.length} edges, ${primary.graph.layers.length} layers`,
        `Tests:    ${primary.excludesTests ? "excluded from this map" : "included"}`,
        `Problems: ${primary.issues.length === 0 ? "none" : primary.issues.slice(0, 10).join("; ")}`,
        ...others.map((o) => `Also:     ${o.uaDir} (${o.fileCount} files)`),
      ];
      return emit(
        {
          uaDir: primary.uaDir,
          projectDir: primary.projectDir,
          builtAt: built,
          head,
          files: primary.fileCount,
          edges: primary.graph.edges.length,
          layers: primary.graph.layers.length,
          excludesTests: primary.excludesTests,
          issues: primary.issues,
          otherMaps: others.map((o) => o.uaDir),
        },
        lines.join("\n"),
      );
    }

    default:
      return { out: `Unknown command "${args.command}".\n\n${USAGE}`, code: 1 };
  }
}

/**
 * omp does not run Claude Code SessionStart hooks, so the card reaches it
 * through an extension instead. This installs a shim into omp's own extension
 * directory pointing back at the adapter shipped here.
 */
function runOmp(args: Args): { out: string; code: number } {
  const dir = args.dir ?? defaultOmpExtensionsDir();
  const action = args.rest[0] ?? "status";
  try {
    switch (action) {
      case "install": {
        const r = ompInstall(dir);
        return {
          out:
            `${r.replaced ? "Updated" : "Installed"} the omp adapter at ${r.path}\n` +
            `It loads the card from ${r.target}\n` +
            "Restart omp to pick it up.",
          code: 0,
        };
      }
      case "status": {
        const s = ompStatus(dir);
        if (!s.installed) {
          return { out: `Not installed. Run \`ua-memory omp install\` to add ${s.path}`, code: 0 };
        }
        return {
          out: s.stale
            ? `Installed at ${s.path}, but it points at ${s.target}, which is missing. Re-run \`ua-memory omp install\`.`
            : `Installed at ${s.path}, loading ${s.target}`,
          code: s.stale ? 1 : 0,
        };
      }
      case "uninstall": {
        const r = ompUninstall(dir);
        return { out: r.removed ? `Removed ${dir}` : "Nothing to remove.", code: 0 };
      }
      default:
        return { out: `Unknown: ua-memory omp ${action}. Use install, status or uninstall.`, code: 1 };
    }
  } catch (error) {
    return { out: error instanceof Error ? error.message : String(error), code: 1 };
  }
}

function notFound(map: LoadedMap, query: string): string {
  const near = [...map.byPath.keys()]
    .filter((p) => p.toLowerCase().includes(query.toLowerCase().split("/").pop() ?? ""))
    .slice(0, 5);
  const hint = near.length ? `\nDid you mean:\n  ${near.join("\n  ")}` : "";
  return `No file in the map matches "${query}".${hint}`;
}
