import type { LoadedMap, UaLayer } from "./graph.js";
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
export declare const NO_DEPENDENTS_CAVEAT: string;
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
    functions: {
        name: string;
        lineRange: [number, number] | null;
        summary: string | null;
    }[];
    dependsOn: string[];
    dependedOnBy: string[];
}
/** Exact path, else a suffix that matches exactly one file. */
export declare function resolveFile(map: LoadedMap, query: string): string | null;
/**
 * Files that would feel a change to `path` — reverse dependency edges,
 * followed outward `depth` times. Depth 1 is the direct importers and callers.
 */
export declare function impact(map: LoadedMap, path: string, depth?: number): ImpactHit[];
/**
 * Search over name, tags and summary. A multi-word query must match every
 * word, but the words may land in different fields — "break glass" finds
 * BreakGlassControl, whose name has both halves but never with a space in it.
 * Name matches rank above tag matches, which rank above summary matches.
 */
export declare function where(map: LoadedMap, text: string, limit?: number): WhereHit[];
export declare function describeFile(map: LoadedMap, path: string): FileInfo | null;
export declare function findLayer(map: LoadedMap, name: string): UaLayer | null;
export declare function filesInLayer(map: LoadedMap, layer: UaLayer): string[];
