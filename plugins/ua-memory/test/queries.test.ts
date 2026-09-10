import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadMap } from "../src/graph.js";
import {
  NO_DEPENDENTS_CAVEAT,
  describeFile,
  findLayer,
  impact,
  resolveFile,
  where,
} from "../src/queries.js";

const here = dirname(fileURLToPath(import.meta.url));
const map = loadMap(join(here, "fixtures", "dashboard-ua"));

describe("resolveFile", () => {
  it("takes an exact path", () => {
    expect(resolveFile(map, "src/api/client.ts")).toBe("src/api/client.ts");
  });

  it("takes an unambiguous suffix", () => {
    expect(resolveFile(map, "DemoContext.tsx")).toBe("src/demo/DemoContext.tsx");
  });

  it("refuses an ambiguous suffix", () => {
    expect(resolveFile(map, "index.html")).toBeNull();
  });
});

describe("impact", () => {
  const direct = impact(map, "src/api/client.ts", 1);

  it("finds every importer, including relative ones grep would miss", () => {
    const paths = direct.map((r) => r.path);
    expect(paths).toHaveLength(32);
    expect(paths).toContain("src/api/queries.ts");
    expect(paths).toContain("apps/codewall/api/endpoints.ts");
  });

  it("labels each hit with its layer and the edge that caused it", () => {
    const hit = direct.find((r) => r.path === "src/pages/Rulesets.tsx")!;
    expect(hit.layer).toBe("Route Screens");
    expect(hit.via).toBe("imports");
  });

  it("reaches further at depth 2 without repeating a file", () => {
    const deep = impact(map, "src/api/client.ts", 2);
    expect(deep.length).toBeGreaterThan(direct.length);
    expect(new Set(deep.map((r) => r.path)).size).toBe(deep.length);
  });

  // Two blind spots, pinned so neither can be mistaken for a real answer.
  // The CLI prints NO_DEPENDENTS_CAVEAT on every empty result, so the agent is
  // told rather than left to conclude "nothing uses this, safe to change".

  it("misses dynamic import() edges", () => {
    // src/app/pages.ts lazy-loads 47 route screens; UA records none of them.
    expect(impact(map, "src/pages/Rulesets.tsx", 1)).toEqual([]);
    expect(NO_DEPENDENTS_CAVEAT).toMatch(/import\(\)/);
  });

  it("misses re-exports through a barrel file", () => {
    // src/ui/Modal.tsx has 20 real users, all importing the src/ui barrel.
    expect(impact(map, "src/ui/Modal.tsx", 1)).toEqual([]);
    expect(NO_DEPENDENTS_CAVEAT).toMatch(/barrel/);
  });
});

describe("where", () => {
  it("finds nodes by name, tag or summary and names their layer", () => {
    const hits = where(map, "ruleset", 20);
    expect(hits.length).toBeGreaterThan(3);
    expect(hits.some((h) => h.path === "src/pages/Rulesets.tsx")).toBe(true);
    expect(hits[0].layer).toBeTruthy();
  });

  it("matches every word of a phrase, even across different fields", () => {
    const hits = where(map, "break glass", 20);
    expect(hits.some((h) => h.path === "src/components/BreakGlassControl.tsx")).toBe(true);
  });

  it("finds nothing when one word of the phrase is absent", () => {
    expect(where(map, "break unicorn", 20)).toEqual([]);
  });

  it("respects the limit", () => {
    expect(where(map, "e", 5)).toHaveLength(5);
  });
});

describe("describeFile", () => {
  const info = describeFile(map, "src/demo/DemoContext.tsx")!;

  it("reports the layer, tags and summary", () => {
    expect(info.layer).toBe("Demo Mode");
    expect(info.tags).toContain("react-context");
    expect(info.summary).toMatch(/demo switch/i);
  });

  it("lists the functions the file holds, with line numbers", () => {
    const provider = info.functions.find((f) => f.name === "DemoProvider")!;
    expect(provider.lineRange).toEqual([35, 58]);
  });

  it("counts what it imports and what depends on it", () => {
    expect(info.dependsOn.length).toBeGreaterThan(0);
    expect(info.dependedOnBy.length).toBeGreaterThan(0);
  });
});

describe("findLayer", () => {
  it("matches on a partial name", () => {
    expect(findLayer(map, "design")?.name).toBe("Design System");
  });

  it("returns null for a name no layer has", () => {
    expect(findLayer(map, "database")).toBeNull();
  });
});
