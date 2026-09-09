export declare const SCHEMA_ERROR = "ua-memory: knowledge-graph.json is not the shape we expect";
export interface UaNode {
    id: string;
    type: string;
    name: string;
    filePath: string;
    summary?: string;
    tags?: string[];
    complexity?: string;
    languageNotes?: string;
    lineRange?: [number, number];
}
export interface UaEdge {
    source: string;
    target: string;
    type: string;
    direction?: string;
    weight?: number;
    typeOnly?: boolean;
    note?: string;
}
export interface UaLayer {
    id: string;
    name: string;
    description: string;
    nodeIds: string[];
}
export interface UaProject {
    name: string;
    languages?: string[];
    frameworks?: string[];
    description: string;
    gitCommitHash?: string;
}
export interface UaGraph {
    version: string;
    project: UaProject;
    nodes: UaNode[];
    edges: UaEdge[];
    layers: UaLayer[];
    tour?: unknown[];
}
export interface UaMeta {
    lastAnalyzedAt: string;
    gitCommitHash: string;
    version: string;
    analyzedFiles: number;
}
export interface LoadedMap {
    uaDir: string;
    /** The directory the map describes — the parent of .ua. */
    projectDir: string;
    graph: UaGraph;
    meta: UaMeta | null;
    byId: Map<string, UaNode>;
    byPath: Map<string, UaNode[]>;
    /**
     * Raw layer membership. UA only puts `file`, `endpoint` and `config` nodes
     * in a layer; `function` and `class` nodes carry none of their own and
     * inherit one from their file. Use `layerFor` unless you want the raw fact.
     */
    layerOf: Map<string, UaLayer>;
    /** Resolves a node to its layer, following a function or class to its file. */
    layerFor: (node: UaNode) => UaLayer | null;
    /** Data problems worth reporting but not worth killing a session over. */
    issues: string[];
    /** True when .understandignore actively excludes test files. */
    excludesTests: boolean;
    fileCount: number;
}
/**
 * A schema break throws; a data problem is collected in `issues`.
 *
 * The split is deliberate. This runs inside a SessionStart hook, so one
 * dangling edge must not cost the user their whole card — but a changed UA
 * schema must be loud, because silently rendering a wrong map is worse than
 * rendering none. The fixture test asserts `issues` is empty, so a new UA
 * version that starts emitting dangling edges still turns the suite red.
 */
export declare function loadMap(uaDir: string, graphOverride?: unknown): LoadedMap;
export declare function findGitRoot(startDir: string): string | null;
/**
 * Every usable map at or under the git root, plus any on the path up from cwd.
 * A .ua directory with no knowledge-graph.json is an unfinished run — skip it.
 */
export declare function findMapDirs(cwd: string, maxDepth?: number): string[];
/** The map whose project directory best contains cwd; ties go to the larger map. */
export declare function pickPrimary(maps: LoadedMap[], cwd: string): LoadedMap | null;
