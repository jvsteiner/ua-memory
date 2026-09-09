import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadMap, SCHEMA_ERROR } from "../src/graph.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "fixtures", "dashboard-ua");

describe("loadMap", () => {
  const map = loadMap(FIXTURE);

  it("reads the frozen real run", () => {
    expect(map.graph.nodes).toHaveLength(445);
    expect(map.graph.edges).toHaveLength(1221);
    expect(map.graph.layers).toHaveLength(10);
    expect(map.meta?.analyzedFiles).toBe(157);
  });

  it("indexes nodes by id and by file path", () => {
    expect(map.byId.get("file:src/api/client.ts")?.name).toBe("client.ts");
    expect(map.byPath.get("src/api/client.ts")?.length).toBeGreaterThan(1);
  });

  it("puts every file, endpoint and config node in exactly one layer", () => {
    const layered = new Set(["file", "endpoint", "config"]);
    const missing = map.graph.nodes
      .filter((n) => layered.has(n.type))
      .filter((n) => !map.layerOf.has(n.id));
    expect(missing).toHaveLength(0);
  });

  it("gives functions and classes no layer of their own", () => {
    const own = map.graph.nodes
      .filter((n) => n.type === "function" || n.type === "class")
      .filter((n) => map.layerOf.has(n.id));
    expect(own).toHaveLength(0);
  });

  it("resolves a function to the layer of the file that holds it", () => {
    const fn = map.byId.get("function:src/demo/DemoContext.tsx:DemoProvider")!;
    expect(map.layerFor(fn)?.id).toBe("layer:demo-mode");
  });

  it("finds no data problems in a known-good map", () => {
    expect(map.issues).toEqual([]);
  });

  it("knows tests were excluded from this map", () => {
    expect(map.excludesTests).toBe(true);
  });

  it("throws loudly when a required top-level key is missing", () => {
    expect(() => loadMap(FIXTURE, { version: "1.0.0" })).toThrow(SCHEMA_ERROR);
  });

  it("reports a dangling edge as an issue instead of throwing", () => {
    const broken = structuredClone(map.graph) as typeof map.graph;
    broken.edges.push({ source: "file:nope.ts", target: "file:src/app/App.tsx", type: "imports" });
    const out = loadMap(FIXTURE, broken);
    expect(out.issues.join(" ")).toContain("file:nope.ts");
  });
});
