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
