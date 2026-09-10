import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { INSTALLED_FILENAME, ompInstall, ompStatus, ompUninstall } from "../src/omp-install.js";

const made: string[] = [];
const dir = () => {
  const d = mkdtempSync(join(tmpdir(), "ua-omp-"));
  made.push(d);
  return d;
};
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("ompInstall", () => {
  it("writes a shim that re-exports the built adapter", () => {
    const d = dir();
    const result = ompInstall(d);
    const written = readFileSync(result.path, "utf8");
    expect(result.path.endsWith(INSTALLED_FILENAME)).toBe(true);
    expect(written).toContain("export { default }");
    expect(written).toContain("dist/omp.js");
  });

  it("points at an absolute path, so a copy works as well as a symlink", () => {
    const d = dir();
    const written = readFileSync(ompInstall(d).path, "utf8");
    const target = written.match(/from "([^"]+)"/)?.[1] ?? "";
    expect(target.startsWith("/")).toBe(true);
    expect(existsSync(target)).toBe(true);
  });

  it("marks the file as generated so nobody hand-edits it", () => {
    const d = dir();
    expect(readFileSync(ompInstall(d).path, "utf8")).toMatch(/do not edit/i);
  });

  it("is idempotent and reports when it replaced an older shim", () => {
    const d = dir();
    expect(ompInstall(d).replaced).toBe(false);
    expect(ompInstall(d).replaced).toBe(true);
  });

  it("creates the extensions directory when omp has never had one", () => {
    const d = join(dir(), "agent", "extensions");
    expect(existsSync(ompInstall(d).path)).toBe(true);
  });

  it("refuses to overwrite a file it did not write", () => {
    const d = dir();
    writeFileSync(join(d, INSTALLED_FILENAME), "// someone's own extension\n");
    expect(() => ompInstall(d)).toThrow(/not written by ua-memory/i);
  });
});

describe("ompStatus and ompUninstall", () => {
  it("reports missing before install and installed after", () => {
    const d = dir();
    expect(ompStatus(d).installed).toBe(false);
    ompInstall(d);
    const after = ompStatus(d);
    expect(after.installed).toBe(true);
    expect(after.target && existsSync(after.target)).toBe(true);
  });

  it("removes only its own file", () => {
    const d = dir();
    ompInstall(d);
    expect(ompUninstall(d).removed).toBe(true);
    expect(ompStatus(d).installed).toBe(false);
    expect(ompUninstall(d).removed).toBe(false);
  });
});
