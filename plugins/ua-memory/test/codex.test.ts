import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mapped = join(root, "test", "fixtures", "mapped-project");
const unmapped = join(root, "test");

describe("the Codex plugin integration", () => {
  it("ships a native Codex manifest", () => {
    const manifestPath = join(root, ".codex-plugin", "plugin.json");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.name).toBe("ua-memory");
    expect(manifest.version).toBe("0.5.0");
    expect(manifest.interface.capabilities).toContain("Read");
  });

  it("uses the shared SessionStart hook with Codex's context limit", () => {
    const hooks = JSON.parse(readFileSync(join(root, "hooks", "hooks.json"), "utf8"));
    const hook = hooks.hooks.SessionStart[0].hooks[0];
    expect(hook.command).toContain("PLUGIN_ROOT");
    expect(hook.command).toContain("CLAUDE_PLUGIN_ROOT");
    expect(hook.additionalContextLimit).toBe(9500);
  });

  it("emits Codex SessionStart context for a mapped project", () => {
    const output = execFileSync("node", [join(root, "hooks", "session-start.mjs")], {
      cwd: mapped,
      encoding: "utf8",
    });
    const result = JSON.parse(output);
    expect(result.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(result.hookSpecificOutput.additionalContext).toContain("# Codebase map — ");
  });

  it("stays silent where no map is available", () => {
    const output = execFileSync("node", [join(root, "hooks", "session-start.mjs")], {
      cwd: unmapped,
      encoding: "utf8",
    });
    expect(output).toBe("");
  });
});
