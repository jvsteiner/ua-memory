#!/usr/bin/env node
// SessionStart hook. Prints the codebase architecture card as additionalContext.
//
// It must never break a session: any failure exits 0 with no output, except a
// UA schema break, which is reported as one line so it cannot pass unnoticed.
import { buildCardFor } from "../dist/session.js";

const emit = (text) =>
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text },
    }),
  );

try {
  const card = buildCardFor(process.cwd());
  if (card) emit(card);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("ua-memory:")) {
    emit(`ua-memory could not read this repo's map: ${message}`);
  }
}
process.exit(0);
