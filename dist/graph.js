import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
export const SCHEMA_ERROR = "ua-memory: knowledge-graph.json is not the shape we expect";
/** Required top-level keys. A missing one means the UA schema moved under us. */
const REQUIRED_KEYS = ["version", "project", "nodes", "edges", "layers"];
function readJson(path) {
    return JSON.parse(readFileSync(path, "utf8"));
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
export function loadMap(uaDir, graphOverride) {
    const dir = resolve(uaDir);
    const graph = (graphOverride ?? readJson(join(dir, "knowledge-graph.json")));
    if (!graph || typeof graph !== "object")
        throw new Error(SCHEMA_ERROR);
    for (const key of REQUIRED_KEYS) {
        if (!(key in graph))
            throw new Error(`${SCHEMA_ERROR}: missing "${key}"`);
    }
    if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || !Array.isArray(graph.layers)) {
        throw new Error(`${SCHEMA_ERROR}: nodes, edges and layers must all be arrays`);
    }
    const metaPath = join(dir, "meta.json");
    const meta = existsSync(metaPath) ? readJson(metaPath) : null;
    const issues = [];
    const byId = new Map();
    const byPath = new Map();
    for (const node of graph.nodes) {
        if (byId.has(node.id))
            issues.push(`duplicate node id ${node.id}`);
        byId.set(node.id, node);
        const list = byPath.get(node.filePath);
        if (list)
            list.push(node);
        else
            byPath.set(node.filePath, [node]);
    }
    for (const edge of graph.edges) {
        if (!byId.has(edge.source))
            issues.push(`dangling edge source ${edge.source}`);
        if (!byId.has(edge.target))
            issues.push(`dangling edge target ${edge.target}`);
    }
    const layerOf = new Map();
    for (const layer of graph.layers) {
        for (const id of layer.nodeIds) {
            if (!byId.has(id))
                issues.push(`layer ${layer.id} names unknown node ${id}`);
            else if (layerOf.has(id))
                issues.push(`node ${id} is in two layers`);
            else
                layerOf.set(id, layer);
        }
    }
    const layerFor = (node) => {
        const direct = layerOf.get(node.id);
        if (direct)
            return direct;
        const fileNode = (byPath.get(node.filePath) ?? []).find((n) => n.type === "file");
        return fileNode ? layerOf.get(fileNode.id) ?? null : null;
    };
    return {
        uaDir: dir,
        projectDir: dirname(dir),
        graph,
        meta,
        byId,
        byPath,
        layerOf,
        layerFor,
        issues,
        excludesTests: readExcludesTests(dir),
        fileCount: graph.nodes.filter((n) => n.type === "file").length,
    };
}
/** Does .understandignore carry an uncommented test pattern? */
function readExcludesTests(uaDir) {
    const path = join(uaDir, ".understandignore");
    if (!existsSync(path))
        return false;
    return readFileSync(path, "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"))
        .some((line) => /test|spec/i.test(line));
}
/** Directories never worth walking into when hunting for maps. */
const SKIP_DIRS = new Set([
    "node_modules", ".git", "dist", "build", "target", "coverage",
    "tmp", "intermediate", "vendor", ".next", ".venv",
]);
export function findGitRoot(startDir) {
    let dir = resolve(startDir);
    for (;;) {
        if (existsSync(join(dir, ".git")))
            return dir;
        const up = dirname(dir);
        if (up === dir)
            return null;
        dir = up;
    }
}
/**
 * Every usable map at or under the git root, plus any on the path up from cwd.
 * A .ua directory with no knowledge-graph.json is an unfinished run — skip it.
 */
export function findMapDirs(cwd, maxDepth = 3) {
    const start = resolve(cwd);
    const root = findGitRoot(start) ?? start;
    const found = new Set();
    const walk = (dir, depth) => {
        const candidate = join(dir, ".ua", "knowledge-graph.json");
        if (existsSync(candidate))
            found.add(join(dir, ".ua"));
        if (depth >= maxDepth)
            return;
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (!entry.isDirectory())
                continue;
            if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name))
                continue;
            walk(join(dir, entry.name), depth + 1);
        }
    };
    walk(root, 0);
    // Also look straight up from cwd, in case cwd sits outside the walked depth.
    let dir = start;
    for (;;) {
        if (existsSync(join(dir, ".ua", "knowledge-graph.json")))
            found.add(join(dir, ".ua"));
        if (dir === root)
            break;
        const up = dirname(dir);
        if (up === dir)
            break;
        dir = up;
    }
    return [...found].sort();
}
/** The map whose project directory best contains cwd; ties go to the larger map. */
export function pickPrimary(maps, cwd) {
    if (maps.length === 0)
        return null;
    const here = resolve(cwd) + sep;
    const contains = (m) => here.startsWith(resolve(m.projectDir) + sep);
    const inScope = maps.filter(contains);
    const pool = inScope.length > 0 ? inScope : maps;
    return pool.reduce((best, m) => {
        const deeper = m.projectDir.length > best.projectDir.length;
        if (inScope.length > 0)
            return deeper ? m : best;
        return m.fileCount > best.fileCount ? m : best;
    });
}
