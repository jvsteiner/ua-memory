import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadMap } from "../src/graph.js";
import { estimateTokens, renderCard, TOKEN_BUDGET } from "../src/card.js";

const here = dirname(fileURLToPath(import.meta.url));
const map = loadMap(join(here, "fixtures", "dashboard-ua"));

describe("renderCard", () => {
  const card = renderCard(map, [], { head: map.meta!.gitCommitHash, changedFiles: [] });

  it("stays inside the token budget", () => {
    expect(estimateTokens(card)).toBeLessThan(TOKEN_BUDGET);
  });

  it("does not trim a map that already fits", () => {
    expect(card).not.toContain("shortened to fit");
  });

  it("names every layer", () => {
    for (const layer of map.graph.layers) expect(card).toContain(layer.name);
  });

  it("lists file paths, not summaries", () => {
    expect(card).toContain("src/api/client.ts");
    expect(card).not.toContain("Ruleset CRUD plus");
  });

  it("says the map is current when the commit matches HEAD", () => {
    expect(card).toMatch(/current|up to date/i);
  });

  it("warns and names changed files when HEAD has moved", () => {
    const stale = renderCard(map, [], {
      head: "deadbeef",
      changedFiles: ["src/api/client.ts", "src/ui/Button.tsx"],
    });
    expect(stale).toContain("2 file");
    expect(stale).toContain("src/ui/Button.tsx");
  });

  it("states the trust rule", () => {
    expect(card).toMatch(/tree-sitter/);
    expect(card).toMatch(/hint/i);
  });

  it("flags that tests are outside the map", () => {
    expect(card).toMatch(/test/i);
  });

  it("mentions other maps in the repo without inlining them", () => {
    const withOther = renderCard(map, [map], { head: null, changedFiles: null });
    expect(withOther).toMatch(/also mapped/i);
  });
});

/**
 * A map big enough to blow the budget. The real sif root map (274 files, 1,711
 * nodes) rendered at ~4,000 tokens, so the cap has to be enforced where the
 * card is built, not only in a test against a small fixture — that is how the
 * overrun got through the first time.
 */
function inflate(base: typeof map, factor: number): typeof map {
  const graph = structuredClone(base.graph);
  const extra: typeof graph.nodes = [];
  for (const layer of graph.layers) {
    const seed = layer.nodeIds.filter((id) => id.startsWith("file:"));
    for (let i = 0; i < factor; i++) {
      for (const id of seed) {
        const clone = { ...base.byId.get(id)!, id: `${id}#${i}`, filePath: `${id.slice(5)}#${i}` };
        extra.push(clone);
        layer.nodeIds.push(clone.id);
      }
    }
  }
  graph.nodes.push(...extra);
  return loadMap(join(here, "fixtures", "dashboard-ua"), graph);
}

describe("renderCard on a map too big for the budget", () => {
  const big = inflate(map, 6);
  const card = renderCard(big, [], { head: null, changedFiles: null });

  it("comes in under budget anyway", () => {
    expect(estimateTokens(card)).toBeLessThan(TOKEN_BUDGET);
  });

  it("still names every layer and keeps every description", () => {
    for (const layer of big.graph.layers) {
      expect(card).toContain(layer.name);
      expect(card).toContain(layer.description);
    }
  });

  it("says it was shortened, and where to get the rest", () => {
    expect(card).toContain("shortened to fit");
    expect(card).toMatch(/ua-memory layer/);
  });

  it("reports how many files it left out", () => {
    expect(card).toMatch(/\d+ more/);
  });
});
