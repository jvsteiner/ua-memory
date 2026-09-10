import { describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import createExtension, { CARD_MARKER } from "../src/omp.js";

const here = dirname(fileURLToPath(import.meta.url));
const MAPPED = join(here, "fixtures", "mapped-project");
const UNMAPPED = here;

/** Minimal stand-in for the `pi` object omp hands an extension. */
function fakePi() {
  const handlers = new Map<string, (event: unknown, ctx: unknown) => unknown>();
  return {
    on(name: string, fn: (event: unknown, ctx: unknown) => unknown) {
      handlers.set(name, fn);
    },
    fire(name: string, event: unknown, ctx: unknown) {
      return handlers.get(name)?.(event, ctx);
    },
    has: (name: string) => handlers.has(name),
  };
}

describe("the omp extension", () => {
  it("registers on before_agent_start", () => {
    const pi = fakePi();
    createExtension(pi);
    expect(pi.has("before_agent_start")).toBe(true);
  });

  it("appends the card to an omp string[] system prompt", () => {
    const pi = fakePi();
    createExtension(pi);
    const out = pi.fire("before_agent_start", { systemPrompt: ["base"] }, { cwd: MAPPED }) as {
      systemPrompt: string[];
    };
    expect(out.systemPrompt).toHaveLength(2);
    expect(out.systemPrompt[0]).toBe("base");
    expect(out.systemPrompt[1]).toContain(CARD_MARKER);
  });

  it("appends to a Pi single-string system prompt and returns the same shape", () => {
    const pi = fakePi();
    createExtension(pi);
    const out = pi.fire("before_agent_start", { systemPrompt: "base" }, { cwd: MAPPED }) as {
      systemPrompt: string;
    };
    expect(typeof out.systemPrompt).toBe("string");
    expect(out.systemPrompt).toContain("base");
    expect(out.systemPrompt).toContain(CARD_MARKER);
  });

  // Defensive only. Measured behaviour is that omp fires this once per user
  // message and rebuilds the prompt from base, so a prompt already carrying a
  // card is not something omp produces today. This pins the guard anyway,
  // because appending a second card would be silent rather than loud.
  //
  // Note what this test does NOT show: it feeds the modified prompt back in by
  // hand, so it can never tell you whether omp accumulates. That question was
  // settled by probing a live omp run, not here.
  it("does not add the card to a prompt that already has one", () => {
    const pi = fakePi();
    createExtension(pi);
    const first = pi.fire("before_agent_start", { systemPrompt: ["base"] }, { cwd: MAPPED }) as {
      systemPrompt: string[];
    };
    const second = pi.fire("before_agent_start", { systemPrompt: first.systemPrompt }, { cwd: MAPPED });
    expect(second).toBeUndefined();
  });

  it("does nothing in a project with no map", () => {
    const pi = fakePi();
    createExtension(pi);
    expect(pi.fire("before_agent_start", { systemPrompt: ["base"] }, { cwd: UNMAPPED })).toBeUndefined();
  });

  it("never throws out of the handler", () => {
    const pi = fakePi();
    createExtension(pi);
    expect(() => pi.fire("before_agent_start", null, null)).not.toThrow();
    expect(() => pi.fire("before_agent_start", { systemPrompt: 42 }, { cwd: MAPPED })).not.toThrow();
  });

  it("re-reads the map when the working directory changes", () => {
    const pi = fakePi();
    createExtension(pi);
    pi.fire("before_agent_start", { systemPrompt: ["a"] }, { cwd: MAPPED });
    const elsewhere = pi.fire("before_agent_start", { systemPrompt: ["a"] }, { cwd: UNMAPPED });
    expect(elsewhere).toBeUndefined();
  });
});
