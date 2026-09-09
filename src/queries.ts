import type { LoadedMap, UaLayer, UaNode } from "./graph.js";

/**
 * Two verified gaps in UA's edge extraction, both measured on the dashboard map:
 *
 * 1. Dynamic imports. `src/app/pages.ts` lazy-loads 47 route screens with
 *    `import()`, and none of those appear as edges.
 * 2. Barrel re-exports. 13 files in `src/ui` carry no cross-file edge at all,
 *    because consumers import the `src/ui` barrel rather than the file.
 *    `src/ui/Modal.tsx` has 20 real users and zero recorded edges.
 *
 * So an empty result means "nothing static points here", never "safe to change".
 */
export const NO_DEPENDENTS_CAVEAT =
  "No static dependents found. This is not proof the file is unused. The map " +
  "records neither dynamic import() edges nor re-exports through a barrel " +
  "file, so a lazily-loaded route or a component behind an index.ts can look " +
  "unreferenced when it is not. Confirm with grep before changing it.";

/** Edge types that mean "this would break if the target changed". */
const DEPENDENCY_EDGES = new Set(["imports", "calls", "depends_on", "configures"]);

export interface ImpactHit {
  path: string;
  layer: string | null;
  via: string;
  depth: number;
}

export interface WhereHit {
  id: string;
  type: string;
  name: string;
  path: string;
  layer: string | null;
  why: string;
}

export interface FileInfo {
  path: string;
  layer: string | null;
  summary: string | null;
  tags: string[];
  complexity: string | null;
  languageNotes: string | null;
  functions: { name: string; lineRange: [number, number] | null; summary: string | null }[];
  dependsOn: string[];
  dependedOnBy: string[];
}

/** Exact path, else a suffix that matches exactly one file. */
export function resolveFile(map: LoadedMap, query: string): string | null {
  if (map.byPath.has(query)) return query;
  const needle = query.startsWith("/") ? query : `/${query}`;
  const matches = [...map.byPath.keys()].filter((p) => p === query || p.endsWith(needle));
  return matches.length === 1 ? matches[0] : null;
}

function layerName(map: LoadedMap, node: UaNode): string | null {
  return map.layerFor(node)?.name ?? null;
}

/**
 * Files that would feel a change to `path` — reverse dependency edges,
 * followed outward `depth` times. Depth 1 is the direct importers and callers.
 */
export function impact(map: LoadedMap, path: string, depth = 1): ImpactHit[] {
  const start = resolveFile(map, path);
  if (!start) return [];

  const seenFiles = new Set<string>([start]);
  const hits: ImpactHit[] = [];
  let frontier = new Set(
    (map.byPath.get(start) ?? []).map((n) => n.id),
  );

  for (let level = 1; level <= depth; level++) {
    const next = new Set<string>();
    for (const edge of map.graph.edges) {
      if (!frontier.has(edge.target)) continue;
      if (!DEPENDENCY_EDGES.has(edge.type)) continue;
      const source = map.byId.get(edge.source);
      if (!source || seenFiles.has(source.filePath)) continue;
      seenFiles.add(source.filePath);
      hits.push({
        path: source.filePath,
        layer: layerName(map, source),
        via: edge.type,
        depth: level,
      });
      for (const node of map.byPath.get(source.filePath) ?? []) next.add(node.id);
    }
    if (next.size === 0) break;
    frontier = next;
  }

  return hits.sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path));
}

/**
 * Search over name, tags and summary. A multi-word query must match every
 * word, but the words may land in different fields — "break glass" finds
 * BreakGlassControl, whose name has both halves but never with a space in it.
 * Name matches rank above tag matches, which rank above summary matches.
 */
export function where(map: LoadedMap, text: string, limit = 20): WhereHit[] {
  const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [];
  const scored: { hit: WhereHit; score: number }[] = [];

  for (const node of map.graph.nodes) {
    const name = node.name.toLowerCase();
    const tags = (node.tags ?? []).join(" ").toLowerCase();
    const summary = (node.summary ?? "").toLowerCase();
    const haystack = `${name} ${tags} ${summary}`;
    if (!words.every((w) => haystack.includes(w))) continue;

    const score = words.every((w) => name.includes(w))
      ? 3
      : words.every((w) => `${name} ${tags}`.includes(w))
        ? 2
        : 1;
    const why = score === 3 ? "name" : score === 2 ? "tag" : "summary";

    scored.push({
      score,
      hit: {
        id: node.id,
        type: node.type,
        name: node.name,
        path: node.filePath,
        layer: layerName(map, node),
        why,
      },
    });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.hit.path.localeCompare(b.hit.path))
    .slice(0, limit)
    .map((s) => s.hit);
}

export function describeFile(map: LoadedMap, path: string): FileInfo | null {
  const resolved = resolveFile(map, path);
  if (!resolved) return null;
  const nodes = map.byPath.get(resolved) ?? [];
  const fileNode = nodes.find((n) => n.type === "file") ?? nodes[0];
  if (!fileNode) return null;

  const ownIds = new Set(nodes.map((n) => n.id));
  const dependsOn = new Set<string>();
  const dependedOnBy = new Set<string>();

  for (const edge of map.graph.edges) {
    if (!DEPENDENCY_EDGES.has(edge.type)) continue;
    if (ownIds.has(edge.source)) {
      const target = map.byId.get(edge.target);
      if (target && target.filePath !== resolved) dependsOn.add(target.filePath);
    }
    if (ownIds.has(edge.target)) {
      const source = map.byId.get(edge.source);
      if (source && source.filePath !== resolved) dependedOnBy.add(source.filePath);
    }
  }

  return {
    path: resolved,
    layer: layerName(map, fileNode),
    summary: fileNode.summary ?? null,
    tags: fileNode.tags ?? [],
    complexity: fileNode.complexity ?? null,
    languageNotes: fileNode.languageNotes ?? null,
    functions: nodes
      .filter((n) => n.type === "function" || n.type === "class")
      .map((n) => ({
        name: n.name,
        lineRange: n.lineRange ?? null,
        summary: n.summary ?? null,
      }))
      .sort((a, b) => (a.lineRange?.[0] ?? 0) - (b.lineRange?.[0] ?? 0)),
    dependsOn: [...dependsOn].sort(),
    dependedOnBy: [...dependedOnBy].sort(),
  };
}

export function findLayer(map: LoadedMap, name: string): UaLayer | null {
  const needle = name.toLowerCase();
  return (
    map.graph.layers.find((l) => l.name.toLowerCase() === needle) ??
    map.graph.layers.find((l) => l.id.toLowerCase() === needle) ??
    map.graph.layers.find((l) => l.name.toLowerCase().includes(needle)) ??
    map.graph.layers.find((l) => l.id.toLowerCase().includes(needle)) ??
    null
  );
}

export function filesInLayer(map: LoadedMap, layer: UaLayer): string[] {
  return layer.nodeIds
    .map((id) => map.byId.get(id))
    .filter((n): n is UaNode => !!n && n.type === "file")
    .map((n) => n.filePath)
    .sort();
}
