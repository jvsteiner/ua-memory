#!/usr/bin/env node
// SessionStart hook. Prints the codebase architecture card as additionalContext.
//
// Nothing here may reach the user's session as noise. The import is dynamic and
// inside the try, because a static import of a missing dist/ fails before any
// code runs and dumps a stack trace to stderr — which is exactly what a fresh
// clone with no build did. The only failure worth reporting is a UA schema
// break, because rendering a wrong map is worse than rendering none.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const emit = (text) =>
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text },
    }),
  );

try {
  const here = dirname(fileURLToPath(import.meta.url));
  const { buildCardFor } = await import(join(here, "..", "dist", "session.js"));
  const card = buildCardFor(process.cwd());
  if (card) emit(card);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("ua-memory:")) {
    emit(`ua-memory could not read this repo's map: ${message}`);
  }
}
process.exit(0);
