import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = mkdtempSync(join(tmpdir(), "ua-memory-dist-"));
afterAll(() => rmSync(out, { recursive: true, force: true }));

/**
 * dist/ is committed, because a Claude Code plugin is cloned and run with no
 * install or build step — an unbuilt clone silently produced no card at all.
 * Committed build output can drift from its source, so this rebuilds into a
 * temp directory and compares. If it fails, run `npm run build` and commit.
 */
describe("committed dist/", () => {
  execFileSync("npx", ["tsc", "-p", "tsconfig.json", "--outDir", out], { cwd: root });

  const built = readdirSync(out).filter((f) => f.endsWith(".js"));

  it("has a file for every compiled source", () => {
    const shipped = readdirSync(join(root, "dist")).filter((f) => f.endsWith(".js"));
    expect(shipped.sort()).toEqual(built.sort());
  });

  it("matches what src/ compiles to right now", () => {
    for (const file of built) {
      const fresh = readFileSync(join(out, file), "utf8");
      const shipped = readFileSync(join(root, "dist", file), "utf8");
      expect(shipped, `${file} is stale — run npm run build`).toBe(fresh);
    }
  });
});
